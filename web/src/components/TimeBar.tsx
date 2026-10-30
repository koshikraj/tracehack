"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipForward } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import type { ViewAction } from "@/lib/view";
import { utc } from "@/lib/format";
import { PostAvatar, SourceLogo } from "./icons";

const CAT_COLOR: Record<string, string> = {
  drain: "var(--st-held)", freeze: "var(--st-frozen)", rescue: "var(--st-recovered)", exploit: "var(--ink)",
  laundering: "var(--st-lending)", preparation: "var(--muted)", attribution: "var(--st-commingled)",
};
const PLAY_MS = 40_000;

export default function TimeBar({ snap, time, dispatch }: { snap: Snapshot; time: number | null; dispatch: (a: ViewAction) => void }) {
  const t0 = Date.parse(snap.meta.windowStart), t1 = Date.parse(snap.meta.windowEnd);
  const [playing, setPlaying] = useState(false);
  const [tip, setTip] = useState<number | null>(null);
  const raf = useRef(0);
  const cur = time ?? t1;

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let t = time == null || time >= t1 ? t0 : time;
    const step = (now: number) => {
      t += ((now - last) / PLAY_MS) * (t1 - t0); last = now;
      if (t >= t1) { dispatch({ type: "set_time_ms", value: null }); setPlaying(false); return; }
      dispatch({ type: "set_time_ms", value: t });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const events = snap.timeline.filter((e) => { const t = Date.parse(e.time); return t >= t0 && t <= t1; });
  const pct = (t: number) => ((t - t0) / (t1 - t0)) * 100;

  // what's happening "now" on the scrubber: the latest event or post within the last 25 minutes
  const feed = [
    ...events.map((e) => ({ time: e.time, text: e.event, who: e.source, url: e.sourceUrl, color: CAT_COLOR[e.category], post: null as Snapshot["posts"][number] | null })),
    ...snap.posts.map((p) => ({ time: p.time, text: p.text, who: p.role ? `${p.name}, ${p.role}` : p.name, url: p.url, color: undefined as string | undefined, post: p })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const recent = time != null ? [...feed].reverse().find((e) => Date.parse(e.time) <= cur && cur - Date.parse(e.time) < 25 * 60_000) : null;

  return (
    <div className="relative flex items-center gap-2.5 border-t border-line bg-surface px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
      {recent && (
        <div key={recent.time + recent.who} className="pop-in pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 z-20 flex w-[min(520px,90%)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-line bg-raised/95 px-4 py-3 shadow-float backdrop-blur">
          {recent.post ? <PostAvatar post={recent.post} size={32} /> : recent.color ? <span className="dot mt-1" style={{ width: 10, height: 10, background: recent.color }} /> : <SourceLogo source={recent.url} name={recent.who} size={22} />}
          <div className="min-w-0">
            <div className="text-[11px] text-muted"><span className="num font-semibold text-ink">{utc(recent.time, false)}</span> {recent.who}</div>
            <p className="line-clamp-2 text-[12.5px] leading-snug text-ink">{recent.text}</p>
          </div>
        </div>
      )}
      <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause replay" : "Replay the night"}
        className="press flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-3 text-[13px] font-semibold text-surface shadow-card hover:opacity-90 sm:pr-4">
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}<span className="hidden sm:inline">{playing ? "Pause" : "Replay the night"}</span>
      </button>
      <div className="w-[76px] shrink-0 sm:w-[112px]">
        <div className="num display text-[15px] font-semibold leading-tight text-ink">{time == null ? "Latest" : <><span className="sm:hidden">{utc(new Date(cur).toISOString(), false).replace(" UTC", "")}</span><span className="hidden sm:inline">{utc(new Date(cur).toISOString())}</span></>}</div>
        <div className="truncate text-[11px] text-muted">{time == null ? <><span className="sm:hidden">snapshot</span><span className="hidden sm:inline">Snapshot {utc(snap.meta.windowEnd, false)}</span></> : <><span className="sm:hidden">UTC</span><span className="hidden sm:inline">transfers up to here</span></>}</div>
      </div>

      <div className="relative h-11 min-w-0 flex-1">
        <div className="absolute inset-x-0 top-[24px] h-1.5 rounded-full bg-surface-2" />
        <div className="absolute left-0 top-[24px] h-1.5 rounded-full" style={{ width: `${pct(cur)}%`, background: "linear-gradient(90deg, var(--st-frozen), var(--st-lending), var(--st-held))" }} />
        {events.map((e, i) => {
          const x = pct(Date.parse(e.time));
          const passed = Date.parse(e.time) <= cur;
          return (
            <button key={i} onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(i)} onBlur={() => setTip(null)}
              onClick={() => { setPlaying(false); dispatch({ type: "set_time_ms", value: Date.parse(e.time) }); }}
              className="absolute top-[4px] z-10 grid h-4 w-4 -translate-x-1/2 place-items-center" style={{ left: `${x}%` }} aria-label={`${utc(e.time)}: ${e.event}`}>
              <span className="block h-2.5 w-2.5 rounded-full ring-2 ring-surface transition-transform hover:scale-150" style={{ background: CAT_COLOR[e.category] ?? "var(--line-2)", opacity: passed ? 1 : 0.4 }} />
            </button>
          );
        })}
        {tip != null && events[tip] && (
          <div className="pop-in pointer-events-none absolute bottom-[calc(100%+6px)] z-20 w-72 -translate-x-1/2 rounded-xl border border-line bg-raised p-2.5 text-[12px] shadow-float"
            style={{ left: `clamp(150px, ${pct(Date.parse(events[tip].time))}%, calc(100% - 150px))` }}>
            <div className="flex items-center gap-2">
              <span className="dot" style={{ width: 8, height: 8, background: CAT_COLOR[events[tip].category] ?? "var(--line-2)" }} />
              <span className="num font-semibold text-ink">{utc(events[tip].time)}</span>
              <span className="ml-auto text-[11px] text-muted">{events[tip].category}</span>
            </div>
            <p className="mt-1 leading-snug text-ink-2">{events[tip].event}</p>
          </div>
        )}
        <input type="range" min={t0} max={t1} step={60_000} value={cur} aria-label="Time"
          onChange={(e) => { setPlaying(false); const v = Number(e.target.value); dispatch({ type: "set_time_ms", value: v >= t1 ? null : v }); }}
          className="absolute inset-x-0 top-[17px] h-5 w-full cursor-pointer opacity-0" />
        <div className="pointer-events-none absolute top-[19px] h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-surface bg-ink shadow-card" style={{ left: `${pct(cur)}%` }} />
        <div className="absolute inset-x-0 top-[33px] flex justify-between text-[10.5px] text-muted">
          <span><span className="sm:hidden">20:00</span><span className="hidden sm:inline">{utc(snap.meta.windowStart)}</span></span>
          <span><span className="sm:hidden">06:30</span><span className="hidden sm:inline">{utc(snap.meta.windowEnd)}</span></span>
        </div>
      </div>

      {time != null && (
        <button onClick={() => { setPlaying(false); dispatch({ type: "set_time_ms", value: null }); }} className="press flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:text-ink">
          <SkipForward size={14} /><span className="hidden sm:inline">Latest</span>
        </button>
      )}
    </div>
  );
}
