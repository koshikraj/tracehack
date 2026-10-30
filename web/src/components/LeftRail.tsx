"use client";

import type { Snapshot, FundState, NodeState, Chain } from "@/lib/types";
import type { ViewState, ViewAction } from "@/lib/view";
import { ALL_STATES } from "@/lib/view";
import { CHAIN_NAME, STATE_LABEL, STATE_HELP, STATE_VAR, usd, utc } from "@/lib/format";
import { CountUsd, ExtLink, Section, StateDot } from "./ui";
import { ChainIcon, PostAvatar, SourceLogo, TokenIcon } from "./icons";
import type { LiveState } from "./useLive";

const SHOWN: FundState[] = ["attacker_held", "frozen", "in_lending_position", "recovered", "commingled", "freeze_unverified"];
const MIN_OPTS = [0, 1e4, 1e5, 1e6, 1e7];

export default function LeftRail({ snap, view, dispatch, live }: {
  snap: Snapshot; view: ViewState; dispatch: (a: ViewAction) => void; live: LiveState;
}) {
  const est = snap.reported.stolenEstimates;
  const lo = Math.min(...est.map((e) => e.usd ?? Infinity)), hi = Math.max(...est.map((e) => e.usd ?? 0));
  // Live reads re-check native coins at attacker-held wallets. Their net change (valued at the
  // snapshot's prices) is applied to "Held by attacker"; everything else stays as read at snapshot time.
  const P = snap.meta.prices as Record<string, number>;
  const liveRows = live.results.filter((r) => r.moved && r.delta != null);
  const liveDelta = liveRows.reduce((s, r) => s + r.delta! * (P[r.asset] ?? 0), 0);
  const totals = snap.totals.filter((t) => SHOWN.includes(t.state))
    .map((t) => t.state === "attacker_held" && liveRows.length ? { ...t, usd: t.usd + liveDelta } : t);
  const sum = totals.reduce((s, t) => s + Math.max(0, t.usd), 0);
  const unclassified = snap.totals.find((t) => t.state === "unclassified");
  const nodeCount = (c: Chain) => snap.nodes.filter((n) => n.chain === c).length;

  return (
    <aside className="scroll-thin h-full overflow-y-auto border-r border-line bg-surface">
      <Section title="Where it sits now" hint={<>Balances read on-chain 06:11–06:29 UTC on 30 Oct, valued at <b className="font-medium text-ink-2">today&apos;s prices</b>. Click a row to show or hide it on the map.</>}>
        <CountUsd value={sum} className="display block text-[34px] font-bold leading-none tracking-tight text-ink" />
        <p className="mt-1 text-[12px] text-muted">traced to attacker-linked wallets, issuers and recoveries</p>
        {liveRows.length > 0 && (
          <p className="mt-2 rounded-xl px-3 py-2 text-[11.5px] leading-snug" style={{ background: "color-mix(in oklab, var(--st-held) 10%, transparent)", color: "color-mix(in oklab, var(--st-held) 70%, var(--ink))" }}>
            Includes live reads from {utc(live.readUtc, false)}: {liveRows.length} watched wallet{liveRows.length > 1 ? "s" : ""} changed by a net {liveDelta >= 0 ? "+" : "−"}{usd(Math.abs(liveDelta))} in native coins.
          </p>
        )}
        <div className="mt-3 flex h-4 w-full gap-[3px] overflow-hidden rounded-full" role="img"
          aria-label={totals.filter((t) => t.usd > 0).map((t) => `${STATE_LABEL[t.state]} ${usd(t.usd)}`).join(", ")}>
          {totals.filter((t) => t.usd > 0).map((t) => (
            <div key={t.state} title={`${STATE_LABEL[t.state]}: ${usd(t.usd)}`} className="h-full"
              style={{ flex: `${t.usd} 1 0px`, minWidth: 4, background: `var(${STATE_VAR[t.state]})` }} />
          ))}
        </div>
        <ul className="mt-3 space-y-0.5">
          {totals.map((t) => {
            const ns: NodeState | null = t.state === "freeze_unverified" ? null : (t.state as NodeState);
            const on = ns ? view.states.includes(ns) : true;
            const assets = [...new Set(t.items.filter((i) => (i.usd ?? 0) > 0).map((i) => i.asset))].slice(0, 4);
            return (
              <li key={t.state}>
                <button onClick={() => ns && dispatch({ type: "toggle_state", state: ns })} title={STATE_HELP[t.state]} aria-pressed={on}
                  className={`press group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2 ${on ? "" : "opacity-40"}`}>
                  <StateDot state={t.state} size={11} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{STATE_LABEL[t.state]}</span>
                    <span className="mt-0.5 flex items-center gap-1">
                      {assets.map((a) => <TokenIcon key={a} symbol={a} size={13} />)}
                      <span className="num ml-1 text-[11px] text-muted">{sum ? `${((Math.max(0, t.usd) / sum) * 100).toFixed(t.usd / sum < 0.01 ? 1 : 0)}%` : ""}</span>
                    </span>
                  </span>
                  <CountUsd value={t.usd} className="display text-[15px] font-semibold text-ink" />
                </button>
                {t.unpricedAssets.length > 0 && <div className="num pb-1 pl-[34px] text-[11px] text-muted">plus {t.unpricedAssets.join(" and ")}, not priced in this snapshot</div>}
                {t.state === "in_lending_position" && <div className="pb-1 pl-[34px] text-[11px] leading-snug text-muted">{snap.notes.lending}</div>}
                {t.state === "attacker_held" && liveRows.length > 0 && <div className="pb-1 pl-[34px] text-[11px] text-muted">{usd(t.usd - liveDelta)} at snapshot, {liveDelta >= 0 ? "+" : "−"}{usd(Math.abs(liveDelta))} live</div>}
              </li>
            );
          })}
        </ul>
        {unclassified && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-muted">Not counted: {usd(unclassified.usd)} sitting in {unclassified.items.length} unreviewed hops, and anything inside DEX or bridge contracts.</p>}
      </Section>

      <div className="mx-4 border-t border-line" />

      <Section title="Reported stolen" hint="Published estimates at theft-time prices. We haven't checked these, so they're shown as a range.">
        <div className="display num text-[24px] font-bold leading-none tracking-tight text-ink">{usd(lo)} to {usd(hi)}</div>
        <ul className="mt-3 space-y-1.5 text-[12.5px]">
          {est.map((e) => (
            <li key={e.by} className="flex items-center gap-2">
              <SourceLogo source={e.url} name={e.by} size={18} />
              <ExtLink href={e.url} className="min-w-0 flex-1 truncate text-ink-2">{e.by.replace(/ \(.*\)/, "")}</ExtLink>
              <span className="num font-medium text-ink">{e.value}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mx-4 border-t border-line" />

      <Section title="Latest posts" right={<button onClick={() => dispatch({ type: "switch_view", view: "timeline" })} className="press text-[12px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">See all {snap.posts.length}</button>}>
        <div className="mb-3 flex items-center">
          {[...new Map(snap.posts.filter((p) => p.avatar).map((p) => [p.handle, p])).values()].slice(0, 12).map((p, i) => (
            <span key={p.handle} title={`${p.name}${p.role ? `, ${p.role}` : ""}`} className="pop-in" style={{ marginLeft: i ? -8 : 0, animationDelay: `${i * 35}ms` }}>
              <PostAvatar post={{ ...p, verified: false }} size={26} ring />
            </span>
          ))}
        </div>
        <ul className="space-y-2">
          {snap.posts.slice(-3).reverse().map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="press flex gap-2.5 rounded-xl p-2 hover:bg-surface-2">
                <PostAvatar post={p} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5 text-[12px]"><span className="truncate font-semibold text-ink">{p.name}</span><span className="num shrink-0 text-muted">{utc(p.time, false)}</span></span>
                  <span className="line-clamp-2 text-[12px] leading-snug text-ink-2">{p.text}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mx-4 border-t border-line" />

      <Section title="Reported moves" hint="Reported by firms and not checked on-chain by us, so never added to the totals.">
        <ul className="space-y-2.5 text-[12.5px] leading-snug">
          {snap.reported.movements.map((m, i) => (
            <li key={i} className="flex gap-2.5">
              <SourceLogo source={m.url} name={m.by} size={18} />
              <span><span className="font-medium text-ink">{m.label}.</span> <span className="text-ink-2">{m.value}</span> <ExtLink href={m.url} className="text-muted">({m.by})</ExtLink></span>
            </li>
          ))}
          {snap.notTracked.slice(0, 2).map((n) => (
            <li key={n.state} className="rounded-xl border border-dashed border-line-2 px-3 py-2 text-[12px]">
              <span className="font-medium text-ink">{n.state === "mixed" ? "Mixed" : "Sent to exchanges"}</span> <span className="text-muted">isn&apos;t tracked yet. {n.why}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mx-4 border-t border-line" />

      <Section title="Chains" hint="Show or hide a lane. The dot is the live balance check.">
        <div className="grid grid-cols-2 gap-1.5">
          {snap.chains.map((c) => {
            const on = view.chains.includes(c.chain);
            const lc = live.byChain[c.chain];
            return (
              <button key={c.chain} onClick={() => dispatch({ type: "toggle_chain", chain: c.chain })} aria-pressed={on}
                title={`${c.name}: ${c.traced === "edges" ? `${c.edges} aggregated transfers` : c.traced}. Balances read ${utc(c.lastUpdated)}.${lc ? ` Live check: ${lc.status}, ${utc(lc.readUtc)}.` : ""}`}
                className={`press flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[12.5px] ${on ? "border-line bg-raised text-ink shadow-card" : "border-dashed border-line-2 text-muted"}`}>
                <span className={on ? "" : "opacity-40 grayscale"}><ChainIcon chain={c.chain} size={18} /></span>
                <span className="min-w-0 flex-1 truncate font-medium">{CHAIN_NAME[c.chain]}</span>
                <span className="num text-[11px] text-muted">{nodeCount(c.chain)}</span>
                <span className={`dot ${lc?.status === "moved" ? "live-pulse" : ""}`} style={{ width: 6, height: 6, color: "var(--st-held)",
                  background: lc ? (lc.status === "moved" ? "var(--st-held)" : lc.status === "unchanged" ? "var(--good)" : "var(--muted)") : "var(--line-2)" }} />
              </button>
            );
          })}
        </div>
      </Section>

      <div className="mx-4 border-t border-line" />

      <Section title="On the map">
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATES.map((s) => {
            const on = view.states.includes(s);
            return (
              <button key={s} onClick={() => dispatch({ type: "toggle_state", state: s })} title={STATE_HELP[s]} aria-pressed={on}
                className={`press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${on ? "bg-surface-2 text-ink ring-1 ring-line" : "text-muted ring-1 ring-dashed ring-line-2"}`}>
                <span className={on ? "" : "opacity-40"}><StateDot state={s} size={8} /></span>{STATE_LABEL[s]}
                <span className="num text-[10.5px] text-muted">{snap.nodes.filter((n) => n.state === s).length}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 text-[12.5px] text-ink-2">Hide wallets below</div>
        <div className="mt-1.5 grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
          {MIN_OPTS.map((v) => (
            <button key={v} onClick={() => dispatch({ type: "set_min_usd", value: v })} aria-pressed={view.minUsd === v}
              className={`press num rounded-lg py-1 text-[11.5px] font-medium ${view.minUsd === v ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink-2"}`}>{v === 0 ? "Any" : usd(v)}</button>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 text-[12.5px] text-ink-2">
          Hide reported figures
          <span className="relative inline-flex">
            <input type="checkbox" className="peer sr-only" checked={view.onchainOnly} onChange={(e) => dispatch({ type: "set_onchain_only", value: e.target.checked })} />
            <span className="h-5 w-9 rounded-full bg-line-2 transition-colors peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus" />
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform duration-200 peer-checked:translate-x-4" />
          </span>
        </label>
      </Section>

      <p className="px-4 pb-5 pt-1 text-[11px] leading-snug text-muted">{snap.meta.disclaimer} {snap.meta.priceNote}</p>
    </aside>
  );
}
