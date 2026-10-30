"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify, type SankeyNode, type SankeyLink } from "d3-sankey";
import type { Snapshot, FundState } from "@/lib/types";
import { CHAIN_NAME, STATE_LABEL, STATE_VAR, usd } from "@/lib/format";
import { tokenIconUrl } from "./icons";

type N = { id: string; label: string; color: string; kind: "chain" | "asset" | "state"; icon?: string | null };
type L = { source: string; target: string; value: number; state: FundState };

const COUNTED: FundState[] = ["attacker_held", "frozen", "in_lending_position", "recovered", "commingled", "freeze_unverified"];

export default function SankeyView({ snap }: { snap: Snapshot }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 1100, H = 620;

  const graph = useMemo(() => {
    // chain -> asset -> state, from on-chain holdings at today's prices (net lending as one positive flow)
    const agg = new Map<string, number>();
    const assetTotals = new Map<string, number>();
    for (const t of snap.totals) {
      if (!COUNTED.includes(t.state)) continue;
      for (const i of t.items) {
        if (i.usd == null) continue;
        const a = i.asset === "WETH debt" ? "AUSDT" : i.asset;
        assetTotals.set(a, (assetTotals.get(a) ?? 0) + i.usd);
      }
    }
    const topAssets = new Set([...assetTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a));
    for (const t of snap.totals) {
      if (!COUNTED.includes(t.state)) continue;
      for (const i of t.items) {
        if (i.usd == null) continue;
        let a = i.asset === "WETH debt" ? "AUSDT" : i.asset;
        if (!topAssets.has(a)) a = "Other tokens";
        const k = `${i.chain}|${a}|${t.state}`;
        agg.set(k, (agg.get(k) ?? 0) + i.usd);
      }
    }
    const nodes = new Map<string, N>();
    const links: L[] = [];
    const lk = new Map<string, L>();
    for (const [k, v] of agg) {
      if (v <= 0) continue;
      const [chain, asset, state] = k.split("|") as [keyof typeof CHAIN_NAME, string, FundState];
      nodes.set(`c:${chain}`, { id: `c:${chain}`, label: CHAIN_NAME[chain], color: "var(--st-source)", kind: "chain", icon: `/icons/chains/${chain}.svg` });
      nodes.set(`a:${asset}`, { id: `a:${asset}`, label: asset === "AUSDT" ? "aUSDT (net of debt)" : asset, color: "var(--muted)", kind: "asset", icon: tokenIconUrl(asset) });
      nodes.set(`s:${state}`, { id: `s:${state}`, label: STATE_LABEL[state], color: `var(${STATE_VAR[state]})`, kind: "state" });
      for (const [s, t] of [[`c:${chain}`, `a:${asset}`], [`a:${asset}`, `s:${state}`]]) {
        const key = `${s}>${t}>${state}`;
        const cur = lk.get(key);
        if (cur) cur.value += v; else { const l = { source: s, target: t, value: v, state }; lk.set(key, l); links.push(l); }
      }
    }
    const gen = sankey<N, L>().nodeId((d) => d.id).nodeWidth(12).nodePadding(14).nodeAlign(sankeyJustify).extent([[150, 20], [W - 190, H - 20]]);
    return gen({ nodes: [...nodes.values()].map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) });
  }, [snap]);

  const path = sankeyLinkHorizontal();
  const total = snap.totals.filter((t) => COUNTED.includes(t.state)).reduce((s, t) => s + t.usd, 0);

  return (
    <div className="scroll-thin h-full overflow-auto bg-bg p-6">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="display text-[26px] font-bold tracking-tight text-ink">Where the traced funds sit now</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          By chain, then asset, then state. From on-chain balance reads ({usd(total)} at <b>today&apos;s prices</b>). Lending is net of the WETH debt.
          It excludes unpriced AVAX/POL, unclassified hops, and funds already swapped through DEX contracts. Hover a band for its value.
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full rounded-2xl border border-line bg-raised p-2 shadow-card" role="img" aria-label="Sankey diagram from chain to asset to fund state">
          <g fill="none">
            {graph.links.map((l: SankeyLink<N, L>, i) => {
              const key = `${(l.source as SankeyNode<N, L>).id}-${(l.target as SankeyNode<N, L>).id}-${l.state}`;
              const on = !hover || hover === key || hover === (l.source as N).id || hover === (l.target as N).id;
              return (
                <path key={i} d={path(l) ?? ""} stroke={`var(${STATE_VAR[l.state]})`} strokeOpacity={on ? 0.5 : 0.07} style={{ transition: "stroke-opacity .25s" }}
                  strokeWidth={Math.max(1, l.width ?? 1)} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}>
                  <title>{`${(l.source as N).label} → ${(l.target as N).label}: ${usd(l.value)} (${STATE_LABEL[l.state]})`}</title>
                </path>
              );
            })}
          </g>
          {graph.nodes.map((n) => (
            <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
              <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0))} rx={3} fill={n.color} />
              {n.icon && <image href={n.icon} width={16} height={16} x={n.kind === "chain" ? (n.x0 ?? 0) - 26 : (n.x1 ?? 0) + 8} y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2 - 8} />}
              <text x={n.kind === "chain" ? (n.x0 ?? 0) - (n.icon ? 32 : 8) : (n.x1 ?? 0) + (n.icon ? 30 : 8)} y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2} dy="0.35em"
                textAnchor={n.kind === "chain" ? "end" : "start"} className="fill-[var(--ink)] text-[12px] font-medium">
                {n.label}
                <tspan className="fill-[var(--muted)] font-normal" dx={6}>{usd(n.value ?? 0)}</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
