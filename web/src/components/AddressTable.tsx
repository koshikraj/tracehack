"use client";

import { useMemo, useState } from "react";
import type { Snapshot, SNode } from "@/lib/types";
import type { ViewAction } from "@/lib/view";
import { CHAIN_NAME, nodeTitle, usd } from "@/lib/format";
import { ConfBadge, ExtLink, StateBadge } from "./ui";
import { BinanceLogo, ChainIcon, SourceLogo, TokenIcon, isBinanceWallet } from "./icons";

type Key = "held" | "in" | "chain" | "state" | "label";

export default function AddressTable({ snap, dispatch }: { snap: Snapshot; dispatch: (a: ViewAction) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "held", dir: -1 });
  const [hideMinor, setHideMinor] = useState(true);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let r = snap.nodes.filter((n) => !s || n.address.toLowerCase().includes(s) || (n.label ?? "").toLowerCase().includes(s) || n.state.includes(s));
    if (hideMinor && !s) r = r.filter((n) => n.label || n.heldUsd > 1e4 || n.inUsd > 1e5);
    const val = (n: SNode): number | string => sort.k === "held" ? n.heldUsd : sort.k === "in" ? n.inUsd : sort.k === "chain" ? n.chain : sort.k === "state" ? n.state : nodeTitle(n);
    return r.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [snap, q, sort, hideMinor]);

  const Th = ({ k, children, right }: { k: Key; children: React.ReactNode; right?: boolean }) => (
    <th className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))} className="hover:text-ink">
        {children}{sort.k === k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address, label or state…" aria-label="Search addresses"
          className="w-80 max-w-full rounded-xl border border-line-2 bg-raised px-3.5 py-2 text-sm text-ink shadow-card placeholder:text-muted" />
        <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={hideMinor} onChange={(e) => setHideMinor(e.target.checked)} />Hide small unlabelled hops</label>
        <span className="num ml-auto text-xs text-muted">{rows.length} of {snap.nodes.length} addresses · USD at today&apos;s prices</span>
      </div>
      <div className="scroll-thin flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr>
            <Th k="label">Address</Th><Th k="chain">Chain</Th><Th k="state">State</Th>
            <Th k="held" right>Holds now</Th><Th k="in" right>Received</Th>
            <th className="sticky top-0 border-b border-line bg-surface px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Confidence · source</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 400).map((n) => (
              <tr key={n.id} className="cursor-pointer border-b border-line transition-colors hover:bg-surface-2" onClick={() => dispatch({ type: "focus_address", node_id: n.id })}>
                <td className="max-w-[360px] px-3 py-2">
                  <div className="flex items-center gap-1.5 truncate font-medium text-ink">{isBinanceWallet(n) && <BinanceLogo size={15} />}<span className="truncate">{nodeTitle(n)}</span></div>
                  <div className="mono truncate text-[11px] text-muted">{n.explorerUrl ? <ExtLink href={n.explorerUrl}>{n.address}</ExtLink> : n.address}</div>
                </td>
                <td className="px-3 py-2 text-ink-2"><span className="inline-flex items-center gap-2"><ChainIcon chain={n.chain} size={16} />{CHAIN_NAME[n.chain]}</span></td>
                <td className="px-3 py-2"><StateBadge state={n.state} /></td>
                <td className="num px-3 py-2 text-right text-ink"><span className="inline-flex items-center justify-end gap-1.5">{n.holdings.filter((h) => (h.usd ?? 0) > 0).slice(0, 3).map((h) => <TokenIcon key={h.asset} symbol={h.asset} size={14} />)}<span className="font-medium">{n.heldUsd ? usd(n.heldUsd) : "—"}</span></span></td>
                <td className="num px-3 py-2 text-right text-ink-2">{n.inUsd ? usd(n.inUsd) : "—"}</td>
                <td className="max-w-[320px] px-3 py-2"><div className="flex items-center gap-2"><ConfBadge c={n.confidence} compact /><SourceLogo source={n.sourceUrl} name={n.source} size={14} /><span className="truncate text-xs text-muted" title={n.source}><ExtLink href={n.sourceUrl}>{n.source}</ExtLink></span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 400 && <p className="p-3 text-xs text-muted">Showing the first 400. Search to narrow down.</p>}
      </div>
    </div>
  );
}
