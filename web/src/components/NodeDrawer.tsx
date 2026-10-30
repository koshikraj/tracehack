"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, ExternalLink, Route, X } from "lucide-react";
import type { Snapshot, SEdge } from "@/lib/types";
import type { ViewAction } from "@/lib/view";
import { pathFromSource } from "@/lib/graph";
import { CHAIN_NAME, STATE_HELP, STATE_VAR, amt, compactAmt, nodeTitle, short, usd, utc } from "@/lib/format";
import { ConfBadge, ExtLink, StateBadge, StateDot } from "./ui";
import { BinanceLogo, ChainIcon, SourceLogo, TokenIcon, isBinanceWallet } from "./icons";
import type { LiveState } from "./useLive";

const TX_URL: Record<string, string> = {
  eth: "https://etherscan.io/tx/", tron: "https://tronscan.org/#/transaction/", btc: "https://mempool.space/tx/",
  xrp: "https://livenet.xrpl.org/transactions/", sol: "https://solscan.io/tx/", arb: "https://arbiscan.io/tx/",
  avalanche: "https://snowtrace.io/tx/", polygon: "https://polygonscan.com/tx/",
};

export default function NodeDrawer({ snap, id, dispatch, live }: { snap: Snapshot; id: string; dispatch: (a: ViewAction) => void; live: LiveState }) {
  const n = snap.nodes.find((x) => x.id === id);
  const byId = useMemo(() => new Map(snap.nodes.map((x) => [x.id, x])), [snap]);
  const [copied, setCopied] = useState(false);
  if (!n) return null;
  const ins = snap.edges.filter((e) => e.to === id).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  const outs = snap.edges.filter((e) => e.from === id).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  const liveRows = live.results.filter((r) => r.nodeId === id);
  const color = `var(${STATE_VAR[n.state]})`;
  const isGroup = !!n.group || n.id.includes(":group:");

  const FlowList = ({ title, list, dir }: { title: string; list: SEdge[]; dir: "in" | "out" }) => list.length === 0 ? null : (
    <div className="mt-5">
      <h3 className="display mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
        {dir === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{title} <span className="num font-normal text-muted">{list.length}</span>
      </h3>
      <ul className="space-y-1.5">
        {list.slice(0, 8).map((e) => {
          const other = byId.get(dir === "in" ? e.from : e.to);
          return (
            <li key={e.id} className="rounded-xl bg-surface-2 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={e.asset} size={18} />
                <button className="min-w-0 flex-1 truncate text-left font-medium text-ink hover:underline" onClick={() => other && dispatch({ type: "focus_address", node_id: other.id })}>
                  {other ? nodeTitle(other) : "?"}
                </button>
                <span className="num shrink-0 font-medium text-ink">{e.amount != null ? compactAmt(e.amount, e.asset) : e.asset}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 pl-[26px] text-muted">
                {other && <StateDot state={other.state} size={7} />}
                <span className="num">{usd(e.usd)}</span>
                <span>{e.txCount > 0 ? `${e.txCount} tx` : "no tx hash"}</span>
                {e.txs[0] && <ExtLink href={TX_URL[e.chain] + e.txs[0].hash} className="mono">{short(e.txs[0].hash, 6)}</ExtLink>}
                {e.confidence === "reported" && <ExtLink href={e.sourceUrl} className="ml-auto">reported</ExtLink>}
                {e.kind !== "transfer" && e.kind !== "drain" && e.confidence !== "reported" && <span className="ml-auto rounded-md bg-raised px-1.5 py-px">{e.kind}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > 8 && <p className="mt-1.5 text-[11px] text-muted">{list.length - 8} more in Addresses</p>}
    </div>
  );

  return (
    <div className="drawer-in scroll-thin absolute right-3 top-3 z-20 max-h-[calc(100%-24px)] w-[min(384px,calc(100%-24px))] overflow-y-auto rounded-2xl border border-line bg-raised shadow-float">
      <div className="sticky top-0 z-10 overflow-hidden border-b border-line bg-raised">
        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${color} 22%, transparent), transparent 70%)` }} />
        <div className="relative flex items-start gap-3 px-4 pb-3.5 pt-4">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-raised shadow-card ring-1 ring-line">
            {isBinanceWallet(n) ? <BinanceLogo size={26} /> : <ChainIcon chain={n.chain} size={26} />}
            {isBinanceWallet(n) && <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-raised p-0.5 ring-1 ring-line"><ChainIcon chain={n.chain} size={14} /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] text-ink-2">{CHAIN_NAME[n.chain]}{isGroup ? ", group of wallets" : ""}</div>
            <h2 className="display mt-0.5 text-[17px] font-semibold leading-snug text-ink">{nodeTitle(n)}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5"><StateBadge state={n.state} /><ConfBadge c={n.confidence} /></div>
          </div>
          <button onClick={() => dispatch({ type: "select", node_id: null })} aria-label="Close details" className="press -mr-1 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
        </div>
      </div>

      <div className="px-4 pb-5 pt-3.5">
        {(n.heldUsd !== 0 || n.inUsd > 0) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl px-3 py-2.5" style={{ background: `color-mix(in oklab, ${color} 9%, var(--surface-2))` }}>
              <div className="text-[11px] text-ink-2">Holds now</div>
              <div className="num display text-[22px] font-bold leading-tight text-ink">{n.heldUsd ? usd(n.heldUsd) : "—"}</div>
            </div>
            <div className="rounded-xl bg-surface-2 px-3 py-2.5">
              <div className="text-[11px] text-ink-2">Received / sent</div>
              <div className="num display text-[15px] font-semibold leading-tight text-ink">{usd(n.inUsd)}<span className="text-muted"> / </span>{usd(n.outUsd)}</div>
              <div className="text-[10.5px] text-muted">today&apos;s prices</div>
            </div>
          </div>
        )}
        {STATE_HELP[n.state] && <p className="mt-3 text-[12px] leading-snug text-ink-2">{STATE_HELP[n.state]}</p>}

        {!isGroup && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <code className="mono min-w-0 flex-1 break-all text-[11px] leading-relaxed text-ink">{n.address}</code>
            <button aria-label="Copy address" className="press shrink-0 rounded-md p-1 text-ink-2 hover:bg-surface-2 hover:text-ink"
              onClick={() => { navigator.clipboard?.writeText(n.address); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
              {copied ? <Check size={14} style={{ color: "var(--good)" }} /> : <Copy size={14} />}
            </button>
          </div>
        )}
        {n.group && <div className="mt-3 rounded-xl border border-line px-3 py-2 text-[11px]"><div className="mb-1 text-muted">Wallets in this group</div>{n.group.map((a) => <div key={a} className="mono break-all leading-relaxed text-ink">{a}</div>)}</div>}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {n.explorerUrl ? (
            <a href={n.explorerUrl} target="_blank" rel="noopener noreferrer" className="press flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-surface-2">
              <ExternalLink size={14} />Open in explorer
            </a>
          ) : <span />}
          <button onClick={() => dispatch({ type: "highlight_path", node_ids: pathFromSource(snap, n.id) })}
            className="press flex items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[12.5px] font-medium text-surface hover:opacity-90">
            <Route size={14} />Trace the route
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px]">
          <SourceLogo source={n.sourceUrl} name={n.source} size={20} />
          <div className="min-w-0">
            <div className="text-muted">Source</div>
            <div className="text-ink-2"><ExtLink href={n.sourceUrl}>{n.source}</ExtLink></div>
            {n.notes && <div className="mt-1 text-ink-2">{n.notes}</div>}
            {n.firstSeen && <div className="mt-1 text-muted">First seen {utc(n.firstSeen)}</div>}
          </div>
        </div>

        {n.holdings.length > 0 && (
          <div className="mt-5">
            <h3 className="display mb-2 text-[13.5px] font-semibold text-ink">Holdings</h3>
            <ul className="space-y-1.5">
              {n.holdings.map((h, i) => (
                <li key={i} className="rounded-xl border border-line px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <TokenIcon symbol={h.asset} size={20} />
                    <span className="num font-semibold text-ink">{amt(h.amount, h.asset)}</span>
                    <span className="num ml-auto font-medium text-ink">{usd(h.usd)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7 text-muted">
                    <StateBadge state={h.state} /><ConfBadge c={h.confidence} compact />
                    <span>{h.source}{h.checkedUtc ? `, read ${utc(h.checkedUtc, false)}` : ""}</span>
                  </div>
                  {h.note && <div className="mt-1 pl-7 text-muted">{h.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {liveRows.length > 0 && (
          <div className="mt-4 rounded-xl px-3 py-2.5 text-xs" style={{ background: liveRows.some((r) => r.moved) ? "color-mix(in oklab, var(--st-held) 10%, transparent)" : "var(--surface-2)" }}>
            <div className="mb-1 flex items-center gap-2 font-medium text-ink">
              <span className={`dot ${liveRows.some((r) => r.moved) ? "live-pulse" : ""}`} style={{ width: 7, height: 7, color: "var(--st-held)", background: liveRows.some((r) => r.moved) ? "var(--st-held)" : "var(--good)" }} />
              Live balance check
            </div>
            {liveRows.map((r) => (
              <div key={r.asset} className="num flex justify-between gap-2">
                <span className="text-ink-2">{r.asset}</span>
                {r.error ? <span className="text-muted">endpoint unavailable</span> :
                  <span style={{ color: r.moved ? "var(--st-held)" : undefined }}>{amt(r.live, r.asset)}{r.moved ? ` (${r.delta! > 0 ? "+" : ""}${compactAmt(r.delta!)})` : ", unchanged"}</span>}
              </div>
            ))}
            <div className="mt-1 text-muted">Read {utc(liveRows[0].readUtc)} from {liveRows[0].endpoint}</div>
          </div>
        )}

        <FlowList title="Received from" list={ins} dir="in" />
        <FlowList title="Sent to" list={outs} dir="out" />
      </div>
    </div>
  );
}
