"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Heart, MapPin, Repeat2, Eye } from "lucide-react";
import type { Snapshot, TimelineEvent, Post } from "@/lib/types";
import type { ViewAction } from "@/lib/view";
import { utc } from "@/lib/format";
import { ExtLink } from "./ui";
import { PostAvatar, SourceLogo } from "./icons";

const CAT_COLOR: Record<string, string> = {
  drain: "var(--st-held)", freeze: "var(--st-frozen)", rescue: "var(--st-recovered)", exploit: "var(--ink)",
  laundering: "var(--st-lending)", attribution: "var(--st-commingled)",
};
const KIND_LABEL: Record<Post["kind"], string> = {
  official: "Official", issuer: "Issuer", firm: "Analytics firm", investigator: "Investigator", protocol: "Protocol", news: "News", person: "Public figure",
};
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

type Item = { kind: "event"; time: string; e: TimelineEvent } | { kind: "post"; time: string; p: Post };
type Filter = "all" | "event" | "post";

export default function TimelineView({ snap, dispatch }: { snap: Snapshot; dispatch: (a: ViewAction) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [who, setWho] = useState<string | null>(null);
  const accounts = useMemo(() => {
    const m = new Map<string, { p: Post; n: number }>();
    for (const p of snap.posts) { const c = m.get(p.handle); if (c) c.n++; else m.set(p.handle, { p, n: 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [snap]);
  const t0 = Date.parse(snap.meta.windowStart), t1 = Date.parse(snap.meta.windowEnd);
  const items = useMemo<Item[]>(() => [
    ...snap.timeline.map((e) => ({ kind: "event" as const, time: e.time, e })),
    ...snap.posts.map((p) => ({ kind: "post" as const, time: p.time, p })),
  ].filter((i) => (filter === "all" || i.kind === filter) && (!who || (i.kind === "post" && i.p.handle === who)))
    .sort((a, b) => a.time.localeCompare(b.time)), [snap, filter, who]);

  const groups = useMemo(() => {
    const g: { hour: string; items: Item[] }[] = [];
    for (const it of items) {
      const hour = it.time.slice(0, 13);
      if (g.at(-1)?.hour !== hour) g.push({ hour, items: [] });
      g.at(-1)!.items.push(it);
    }
    return g;
  }, [items]);

  const seek = (time: string) => {
    const t = Date.parse(time);
    if (t < t0 || t > t1) return;
    dispatch({ type: "set_time", time }); dispatch({ type: "switch_view", view: "map" });
  };

  return (
    <div className="scroll-thin h-full overflow-auto bg-bg">
      <div className="mx-auto max-w-[760px] px-5 py-7">
        <h2 className="display text-[26px] font-bold tracking-tight text-ink">The night, in order</h2>
        <p className="mt-1.5 max-w-[62ch] text-[14px] text-ink-2">
          {snap.timeline.length} sourced events and {snap.posts.length} posts from organisations, investigators and public figures. Times are UTC. Use the map pin to see the flow map at that moment.
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-raised p-3 shadow-card">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="display text-[14px] font-semibold text-ink">Who posted</span>
            {who ? <button onClick={() => setWho(null)} className="press text-[12px] font-medium text-ink-2 underline underline-offset-2">Show everyone</button>
              : <span className="text-[11.5px] text-muted">Pick someone to see only their posts</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {accounts.map(({ p, n }) => (
              <button key={p.handle} onClick={() => setWho(who === p.handle ? null : p.handle)} aria-pressed={who === p.handle} title={`${p.name}${p.role ? `, ${p.role}` : ""}: ${n} post${n > 1 ? "s" : ""}`}
                className={`press flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12px] transition-all ${who === p.handle ? "bg-ink text-surface" : who ? "opacity-45 hover:opacity-100" : "bg-surface-2 text-ink hover:bg-line"}`}>
                <PostAvatar post={p} size={22} />
                <span className="font-medium">{p.name}</span>
                <span className={`num text-[11px] ${who === p.handle ? "text-surface/70" : "text-muted"}`}>{n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-xl bg-surface-2 p-1">
          {([["all", "Everything"], ["event", "Events"], ["post", "Posts on X"]] as [Filter, string][]).map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`press rounded-lg px-3 py-1.5 text-[13px] font-medium ${filter === f ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink-2"}`}>{l}</button>
          ))}
        </div>

        <div className="mt-6">
          {groups.map((g) => (
            <section key={g.hour} className="relative pb-2">
              <h3 className="display sticky top-0 z-10 -mx-1 mb-2 bg-bg/90 px-1 py-1.5 text-[13px] font-semibold text-muted backdrop-blur">
                {utc(`${g.hour}:00:00Z`)}
              </h3>
              <ol className="relative ml-[7px] space-y-3 border-l-2 border-line pb-3 pl-6">
                {g.items.map((it, i) => it.kind === "event" ? (
                  <li key={`e${i}`} className="relative">
                    <span className="absolute -left-[33px] top-1.5 h-3.5 w-3.5 rounded-full border-[3px] border-bg" style={{ background: CAT_COLOR[it.e.category] ?? "var(--line-2)" }} />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                      <span className="num font-semibold text-ink">{utc(it.e.time, false)}</span>
                      <span className="rounded-full px-2 py-px text-[11px] font-medium" style={{ background: `color-mix(in oklab, ${CAT_COLOR[it.e.category] ?? "var(--muted)"} 14%, transparent)`, color: `color-mix(in oklab, ${CAT_COLOR[it.e.category] ?? "var(--muted)"} 70%, var(--ink))` }}>{it.e.category}</span>
                      <span className={it.e.confidence.startsWith("verified") ? "text-ink-2" : "text-muted"}>{it.e.confidence}</span>
                      {Date.parse(it.e.time) >= t0 && Date.parse(it.e.time) <= t1 && (
                        <button onClick={() => seek(it.e.time)} className="press ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11.5px] font-medium text-ink-2 ring-1 ring-line hover:text-ink"><MapPin size={12} />On the map</button>
                      )}
                    </div>
                    <p className="mt-1 text-[14.5px] leading-snug text-ink">{it.e.event}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                      <SourceLogo source={it.e.sourceUrl} name={it.e.source} size={14} />
                      <ExtLink href={it.e.sourceUrl}>{it.e.source}</ExtLink>
                    </div>
                  </li>
                ) : (
                  <li key={`p${it.p.id}`} className="relative">
                    <span className="absolute -left-[31px] top-4 h-2.5 w-2.5 rounded-full border-2 border-bg bg-line-2" />
                    <article className="rounded-2xl border border-line bg-raised p-3.5 shadow-card">
                      <header className="flex items-center gap-2.5">
                        <PostAvatar post={it.p} size={40} />
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[14.5px] font-semibold text-ink">{it.p.name}</span>
                            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-[10.5px] font-medium text-ink-2">{it.p.role ?? KIND_LABEL[it.p.kind]}</span>
                          </div>
                          <div className="mt-0.5 text-[12px] text-muted">@{it.p.handle}, {utc(it.p.time, false)}</div>
                        </div>
                        <a href={it.p.url} target="_blank" rel="noopener noreferrer" aria-label={`View post by ${it.p.name} on X`}
                          className="press inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-ink-2 ring-1 ring-line hover:text-ink">
                          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.828l-5.35-6.993L4.6 22H1.34l8.02-9.165L1 2h6.996l4.837 6.39L18.244 2Zm-1.197 18h1.89L7.04 3.9H5.01L17.047 20Z"/></svg>
                          View<ExternalLink size={11} />
                        </a>
                      </header>
                      <p className="mt-2.5 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink">{it.p.text}</p>
                      {it.p.media.length > 0 && (
                        <a href={it.p.url} target="_blank" rel="noopener noreferrer" aria-label="Open the post's images on X"
                          className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl ${it.p.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {it.p.media.map((m) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={m} src={m} alt={`Image attached to ${it.p.name}'s post`} loading="lazy"
                              className="max-h-72 w-full rounded-xl border border-line object-cover transition-transform duration-300 hover:scale-[1.015]" />
                          ))}
                        </a>
                      )}
                      <footer className="mt-2.5 flex items-center gap-4 text-[11.5px] text-muted">
                        <span className="inline-flex items-center gap-1"><Heart size={12} />{compact(it.p.likes)}</span>
                        <span className="inline-flex items-center gap-1"><Repeat2 size={12} />{compact(it.p.reposts)}</span>
                        <span className="inline-flex items-center gap-1"><Eye size={12} />{compact(it.p.views)}</span>
                        {Date.parse(it.p.time) >= t0 && Date.parse(it.p.time) <= t1 && (
                          <button onClick={() => seek(it.p.time)} className="press ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-medium text-ink-2 hover:text-ink"><MapPin size={12} />Map at this time</button>
                        )}
                      </footer>
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-muted">Posts from public accounts of organisations, investigators and public figures, shown with their public profile pictures. Private and random accounts are left out. Logos only identify whose post or source it is; this site is not affiliated with any of them.</p>
      </div>
    </div>
  );
}
