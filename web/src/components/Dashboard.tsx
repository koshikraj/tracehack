"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { BookOpen, ChevronDown, Clock3, Map as MapIcon, Moon, PanelLeft, SlidersHorizontal, Sun, Table2, Waypoints, X } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { initialView, reduceView, type ViewName, type AgentAction } from "@/lib/view";
import { CHAIN_NAME, STATE_LABEL, STATE_VAR, compactAmt, nodeTitle, usd, utc } from "@/lib/format";
import FlowMap from "./FlowMap";
import LeftRail from "./LeftRail";
import NodeDrawer from "./NodeDrawer";
import TimeBar from "./TimeBar";
import SankeyView from "./SankeyView";
import AddressTable from "./AddressTable";
import TimelineView from "./TimelineView";
import SourcesView from "./SourcesView";
import ChatPanel from "./ChatPanel";
import { useLive } from "./useLive";
import { IconButton, StateDot } from "./ui";
import { ChainIcon } from "./icons";
import Hop from "./Hop";
import type { LiveState } from "./useLive";

const TABS: { id: ViewName; label: string; icon: typeof MapIcon }[] = [
  { id: "map", label: "Flow map", icon: MapIcon },
  { id: "sankey", label: "Where it sits", icon: Waypoints },
  { id: "table", label: "Addresses", icon: Table2 },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "sources", label: "Sources", icon: BookOpen },
];

/** Brand mark: a route with three stops, the last one held. */
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <rect width="30" height="30" rx="9" fill="var(--ink)" />
      <path d="M7 20 C 11 20, 11 10, 15 10 S 19 20, 23 20" stroke="var(--surface)" strokeOpacity=".45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="4.6" y="17.6" width="4.8" height="4.8" rx="1.3" fill="var(--surface)" />
      <circle cx="15" cy="10" r="2.6" fill="var(--st-frozen)" />
      <circle cx="23" cy="20" r="3.2" fill="var(--st-held)" />
    </svg>
  );
}

function Tabs({ value, onChange }: { value: ViewName; onChange: (v: ViewName) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`);
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);
  return (
    <div ref={wrap} role="tablist" aria-label="Views" className="relative flex rounded-xl bg-surface-2 p-1">
      {ind && <span aria-hidden className="absolute bottom-1 top-1 rounded-lg bg-raised shadow-card transition-all duration-300 [transition-timing-function:var(--ease-out)]" style={{ left: ind.x, width: ind.w }} />}
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} data-tab={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}
          className={`press relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${value === id ? "text-ink" : "text-muted hover:text-ink-2"}`}>
          <Icon size={14} strokeWidth={2.2} aria-hidden />{label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, dispatch] = useReducer(reduceView, initialView);
  const [chatOpen, setChatOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const live = useLive();
  const viewRef = useRef(view); viewRef.current = view;

  useEffect(() => {
    fetch("/snapshot.json").then((r) => r.json()).then(setSnap).catch(() => setErr("The snapshot didn't load. Run npm run snapshot in web/, then reload."));
    let t: string | null = null;
    try { t = localStorage.getItem("tth-theme"); } catch { /* storage unavailable */ }
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (window.innerWidth < 900) setRailOpen(false);
    if (new URLSearchParams(window.location.search).get("assistant") === "open") setChatOpen(true);
    setLegendOpen(window.innerHeight > 860);
  }, []);

  const onAction = useCallback((a: AgentAction) => dispatch(a), []);

  const viewNote = useCallback(() => {
    const v = viewRef.current;
    if (!snap) return "";
    const sel = v.selected ? snap.nodes.find((n) => n.id === v.selected) : null;
    return [
      `view: ${v.view}`,
      `selected: ${sel ? `${sel.id} (${nodeTitle(sel)}, ${STATE_LABEL[sel.state]})` : "none"}`,
      `chains shown: ${v.chains.map((c) => CHAIN_NAME[c]).join(", ")}`,
      `states shown: ${v.states.join(", ")}`,
      v.minUsd ? `min value: ${usd(v.minUsd)}` : "",
      `detail: ${v.detail === "key" ? "key wallets only" : "every hop"}`,
      v.onchainOnly ? "on-chain only: yes" : "",
      `time: ${v.time ? new Date(v.time).toISOString() : "latest"}`,
      v.highlight.length ? `highlighted path: ${v.highlight.join(" -> ")}` : "",
    ].filter(Boolean).join("\n");
  }, [snap]);

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(!dark);
    try { localStorage.setItem("tth-theme", next); } catch { /* ignore */ }
  };

  const movedCount = live.moved.size;

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      <header className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <IconButton label={railOpen ? "Hide totals panel" : "Show totals panel"} onClick={() => setRailOpen((o) => !o)} active={railOpen}><PanelLeft size={17} /></IconButton>
        <div className="flex items-center gap-2.5">
          <Mark />
          <div className="leading-none">
            <h1 className="display text-[19px] font-bold tracking-tight">Trace the Hack</h1>
            <p className="mt-1 hidden text-[11.5px] text-muted 2xl:block">Following the funds from the 29–30 Oct 2026 Binance hot-wallet hack</p>
          </div>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-2 ring-1 ring-line-2"><span className="sm:hidden">Unofficial</span><span className="hidden sm:inline">Unofficial, not affiliated with Binance</span></span>

        <div className="order-last w-full overflow-x-auto lg:order-none lg:ml-4 lg:w-auto">
          <Tabs value={view.view} onChange={(v) => dispatch({ type: "switch_view", view: v })} />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {snap && <LiveMenu snap={snap} live={live} onFocus={(id) => dispatch({ type: "focus_address", node_id: id })} />}
          <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>{dark ? <Sun size={17} /> : <Moon size={17} />}</IconButton>
          <button onClick={() => setChatOpen((o) => !o)}
            className={`press flex items-center gap-1.5 rounded-xl py-1.5 pl-2 pr-3.5 text-[13px] font-semibold ${chatOpen ? "bg-surface-2 text-ink" : "bg-ink text-surface shadow-card hover:opacity-90"}`}>
            {chatOpen ? <X size={15} /> : <Hop size={22} onInk decorative />}<span className="hidden sm:inline">{chatOpen ? "Close" : "Ask Hop"}</span>
          </button>
        </div>
      </header>

      {err && <div className="m-6 rounded-xl border border-line bg-surface p-4 text-sm">{err}</div>}
      {!snap && !err && <div className="grid flex-1 place-items-center"><span className="shimmer display text-lg font-semibold">Loading the map</span></div>}

      {snap && (
        <div className="flex min-h-0 flex-1">
          <div className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 [transition-timing-function:var(--ease-out)] md:block ${railOpen ? "w-[316px]" : "w-0"}`}>
            <div className="h-full w-[316px]"><LeftRail snap={snap} view={view} dispatch={dispatch} live={live} /></div>
          </div>

          {railOpen && (
            <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Totals and filters">
              <button aria-label="Close totals" className="absolute inset-0 bg-black/40" onClick={() => setRailOpen(false)} />
              <div className="drawer-in absolute inset-y-0 left-0 w-[88%] max-w-[340px] shadow-float"><LeftRail snap={snap} view={view} dispatch={dispatch} live={live} /></div>
            </div>
          )}

          <main className="relative flex min-w-0 flex-1 flex-col">
            <MobileSummary snap={snap} live={live} onOpen={() => setRailOpen(true)} />
            <div key={view.view} className="view-in flex min-h-0 flex-1 flex-col">
              {view.view === "map" && (
                <>
                  <div className="relative min-h-0 flex-1">
                    <FlowMap snap={snap} view={view} dispatch={dispatch} moved={live.moved} />
                    {view.selected && <NodeDrawer key={view.selected} snap={snap} id={view.selected} dispatch={dispatch} live={live} />}
                    {view.highlight.length > 1 && (
                      <div className="pop-in absolute left-1/2 top-11 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-[12.5px] text-surface shadow-float" style={{ marginLeft: view.selected ? -200 : 0 }}>
                        <span>Following a {view.highlight.length - 1}-hop route</span>
                        <button className="press rounded-full bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25" onClick={() => dispatch({ type: "highlight_path", node_ids: [] })}>Clear</button>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-14 z-10 flex items-end gap-2">
                    <Legend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
                    <div className="flex rounded-xl border border-line bg-raised p-1 shadow-card" role="group" aria-label="How much detail to show">
                      {([["key", "Key wallets"], ["all", "Every hop"]] as const).map(([d, l]) => (
                        <button key={d} onClick={() => dispatch({ type: "set_detail", value: d })} aria-pressed={view.detail === d}
                          title={d === "key" ? "Labelled wallets and anything worth $1M or more" : "Every traced hop, including small unreviewed ones"}
                          className={`press rounded-lg px-2.5 py-1 text-[12px] font-medium ${view.detail === d ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}>{l}</button>
                      ))}
                    </div>
                    </div>
                  </div>
                  <TimeBar snap={snap} time={view.time} dispatch={dispatch} />
                </>
              )}
              {view.view === "sankey" && <SankeyView snap={snap} />}
              {view.view === "table" && <AddressTable snap={snap} dispatch={dispatch} />}
              {view.view === "timeline" && <TimelineView snap={snap} dispatch={dispatch} />}
              {view.view === "sources" && <SourcesView snap={snap} />}
            </div>
          </main>

          <div className={`fixed inset-x-0 bottom-0 z-30 h-[72dvh] transition-transform duration-300 [transition-timing-function:var(--ease-out)] lg:static lg:h-auto lg:shrink-0 lg:overflow-hidden lg:transition-[width] ${chatOpen ? "translate-y-0 lg:w-[384px]" : "pointer-events-none translate-y-full lg:w-0 lg:translate-y-0"}`}>
            <div className="h-full w-full shadow-float lg:w-[384px] lg:shadow-none"><ChatPanel onAction={onAction} viewNote={viewNote} onClose={() => setChatOpen(false)} /></div>
          </div>
        </div>
      )}

      <footer className="border-t border-line bg-surface px-4 py-1.5 text-[11px] text-muted">
        Unofficial and independent. Not affiliated with Binance or any exchange. Built from public on-chain data and public reports, which may be incomplete. USD values use today&apos;s prices unless stated.
      </footer>
    </div>
  );
}

/** Header pill for the live balance check; opens a list of the wallets that moved and by how much. */
function LiveMenu({ snap, live, onFocus }: { snap: Snapshot; live: LiveState; onFocus: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const rows = live.results.filter((r) => r.moved && r.delta != null);
  const P = snap.meta.prices as Record<string, number>;
  const net = rows.reduce((s, r) => s + r.delta! * (P[r.asset] ?? 0), 0);
  const label = live.loading ? null : rows.length ? `${rows.length} wallet${rows.length > 1 ? "s" : ""} moved, net ${net >= 0 ? "+" : "−"}${usd(Math.abs(net))}` : `No moves since snapshot`;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="press inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:text-ink">
        <span className={`dot ${rows.length ? "live-pulse" : ""}`} style={{ width: 8, height: 8, color: "var(--st-held)", background: live.loading ? "var(--line-2)" : rows.length ? "var(--st-held)" : "var(--good)" }} />
        {label ? <span className="hidden sm:inline">{label}</span> : <span className="shimmer hidden sm:inline">Checking balances</span>}
        <span className="sm:hidden">Live</span>
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <button aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="pop-in absolute right-0 top-[calc(100%+8px)] z-50 w-[min(380px,calc(100vw-24px))] rounded-2xl border border-line bg-raised p-3 shadow-float">
            <div className="display text-[14px] font-semibold text-ink">Live balance check</div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
              Every 60 seconds the {live.results.length} largest attacker-held wallets have their ETH, BTC, TRX, XRP and SOL balances re-read on-chain. Last read {utc(live.readUtc, false)}. Tokens aren&apos;t re-read yet.
            </p>
            {rows.length === 0 ? <p className="mt-3 text-[12.5px] text-ink-2">No balance has changed since the snapshot.</p> : (
              <>
                <ul className="mt-3 space-y-1.5">
                  {rows.sort((a, b) => Math.abs(b.delta! * (P[b.asset] ?? 0)) - Math.abs(a.delta! * (P[a.asset] ?? 0))).map((r) => {
                    const n = snap.nodes.find((x) => x.id === r.nodeId);
                    const v = r.delta! * (P[r.asset] ?? 0);
                    return (
                      <li key={r.nodeId + r.asset}>
                        <button onClick={() => { onFocus(r.nodeId); setOpen(false); }} className="press flex w-full items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2 text-left hover:bg-line">
                          <ChainIcon chain={r.chain} size={18} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-ink">{n ? nodeTitle(n) : r.address}</span>
                            <span className="num block text-[11.5px] text-muted">{compactAmt(r.snapshot, r.asset)} → {compactAmt(r.live!, r.asset)}</span>
                          </span>
                          <span className="num text-right text-[12.5px] font-semibold" style={{ color: v < 0 ? "var(--st-held)" : "var(--good)" }}>
                            {r.delta! > 0 ? "+" : "−"}{compactAmt(Math.abs(r.delta!), r.asset)}<span className="block text-[11px] font-normal text-muted">{v >= 0 ? "+" : "−"}{usd(Math.abs(v))}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2.5 text-[11.5px] leading-snug text-ink-2">
                  Net change across these wallets: <b className="num">{net >= 0 ? "+" : "−"}{usd(Math.abs(net))}</b> at snapshot prices. It&apos;s added to &ldquo;Held by attacker&rdquo; in the totals. Where the money went isn&apos;t traced yet.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Headline numbers for small screens, where the totals panel is hidden behind a button. */
function MobileSummary({ snap, live, onOpen }: { snap: Snapshot; live: LiveState; onOpen: () => void }) {
  const P = snap.meta.prices as Record<string, number>;
  const net = live.results.filter((r) => r.moved && r.delta != null).reduce((s, r) => s + r.delta! * (P[r.asset] ?? 0), 0);
  const shown = ["attacker_held", "frozen", "in_lending_position", "recovered", "commingled", "freeze_unverified"] as const;
  const totals = snap.totals.filter((t) => (shown as readonly string[]).includes(t.state)).map((t) => t.state === "attacker_held" ? { ...t, usd: t.usd + net } : t);
  const sum = totals.reduce((a, t) => a + Math.max(0, t.usd), 0);
  const est = snap.reported.stolenEstimates.map((e) => e.usd ?? 0);
  const held = totals.find((t) => t.state === "attacker_held")!, frozen = totals.find((t) => t.state === "frozen")!;
  return (
    <div className="border-b border-line bg-surface px-3 py-2.5 md:hidden">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="display num text-[26px] font-bold leading-none tracking-tight text-ink">{usd(sum)}</div>
          <div className="mt-1 text-[11.5px] text-muted">traced now, of {usd(Math.min(...est))} to {usd(Math.max(...est))} reported stolen</div>
        </div>
        <button onClick={onOpen} className="press flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink ring-1 ring-line"><SlidersHorizontal size={14} />Totals</button>
      </div>
      <div className="mt-2 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {totals.filter((t) => t.usd > 0).map((t) => <div key={t.state} style={{ flex: `${t.usd} 1 0px`, minWidth: 3, background: `var(${STATE_VAR[t.state]})` }} />)}
      </div>
      <div className="mt-1.5 flex gap-3 text-[11.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><StateDot state="attacker_held" size={8} />Held <b className="num text-ink">{usd(held.usd)}</b></span>
        <span className="inline-flex items-center gap-1.5"><StateDot state="frozen" size={8} />Frozen <b className="num text-ink">{usd(frozen.usd)}</b></span>
      </div>
    </div>
  );
}

function Legend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const items = ["source", "attacker_held", "frozen", "in_lending_position", "recovered", "commingled", "unclassified", "service"] as const;
  if (!open) {
    return <button onClick={onToggle} className="press rounded-xl border border-line bg-raised px-3 py-[7px] text-[12px] font-medium text-ink-2 shadow-card hover:text-ink">Key</button>;
  }
  return (
    <div className="pop-in absolute bottom-0 right-0 z-10 w-[min(300px,calc(100vw-80px))] rounded-2xl border border-line bg-raised/95 px-3 py-2.5 shadow-card backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="display text-[13px] font-semibold text-ink">Map key</span>
        <button onClick={onToggle} aria-label="Hide key" className="press rounded-md p-0.5 text-muted hover:text-ink"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
        {items.map((s) => <span key={s} className="inline-flex items-center gap-1.5 whitespace-nowrap"><StateDot state={s} size={9} />{STATE_LABEL[s]}</span>)}
        <span className="col-span-2 mt-1 inline-flex items-center gap-1.5 border-t border-line pt-1.5 text-muted"><svg width="22" height="6" aria-hidden><line x1="2" y1="3" x2="20" y2="3" stroke="var(--ink-2)" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" /></svg>Reported, no transaction on record</span>
      </div>
    </div>
  );
}
