// Server-only: tool definitions and executors for the chat assistant.
// Data tools answer from the snapshot (every figure carries its source + confidence).
// View tools don't touch data: they are forwarded to the browser, which moves the map.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Snapshot, SNode, SEdge, Chain, NodeState } from "./types";
import type { AgentAction } from "./view";
import { ALL_CHAINS, ALL_STATES } from "./view";
import { pathBetween, pathFromSource, resolveNode } from "./graph";
import { readLive } from "./live";

type Tool = Anthropic.Beta.Messages.BetaTool;

const chainEnum = ALL_CHAINS as string[];
const stateEnum = ALL_STATES as string[];
const views = ["map", "sankey", "table", "timeline", "sources"];

export const TOOLS: Tool[] = [
  // ---- data ----
  { name: "get_overview", description: "Headline numbers: on-chain totals by fund state (today's prices), the published stolen/frozen estimates (theft-time prices, reported), reported-only moves, states not tracked yet, and per-chain coverage and freshness. Call this first for any 'how much / where is it now' question.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "search_addresses", description: "Find addresses (nodes) by address fragment, label text, chain or state. Returns node ids to use with other tools.",
    input_schema: { type: "object", additionalProperties: false, properties: {
      query: { type: "string", description: "Address fragment or label words, e.g. '0x8532', 'stash', 'Aave'. May be empty when filtering by chain/state." },
      chain: { type: "string", enum: chainEnum }, state: { type: "string", enum: stateEnum },
      limit: { type: "integer", minimum: 1, maximum: 25 } } } },
  { name: "get_address", description: "Full detail for one address: label, state, confidence, source, holdings now (each with source and read time), largest inbound and outbound flows with tx hashes.",
    input_schema: { type: "object", additionalProperties: false, required: ["address"], properties: {
      address: { type: "string", description: "Node id like 'eth:0x8532…' or a full/partial address." } } } },
  { name: "get_flows", description: "List aggregated transfers (edges), largest first. Filter by address (either side), chain, asset, kind or minimum USD.",
    input_schema: { type: "object", additionalProperties: false, properties: {
      address: { type: "string" }, direction: { type: "string", enum: ["in", "out", "both"] },
      chain: { type: "string", enum: chainEnum }, asset: { type: "string" },
      kind: { type: "string", enum: ["drain", "transfer", "swap", "lending", "bridge", "rescue"] },
      min_usd: { type: "number" }, limit: { type: "integer", minimum: 1, maximum: 30 } } } },
  { name: "trace_path", description: "Hop path that funds took. With only 'to': shortest path from a drained wallet to that address (follows the largest flows). With 'from' and 'to': directed path between them. Returns node ids in order plus each hop's edges.",
    input_schema: { type: "object", additionalProperties: false, required: ["to"], properties: { from: { type: "string" }, to: { type: "string" } } } },
  { name: "get_timeline", description: "Timeline events (UTC), each with source and confidence. Filter by category (drain, freeze, rescue, exploit, laundering, official, analysis, attribution, response, preparation, disclosure), time range or text.",
    input_schema: { type: "object", additionalProperties: false, properties: {
      category: { type: "string" }, start: { type: "string", description: "ISO time" }, end: { type: "string" }, query: { type: "string" } } } },
  { name: "get_sources", description: "Search the source list (news, official posts, security firms) by text.",
    input_schema: { type: "object", additionalProperties: false, properties: { query: { type: "string" } } } },
  { name: "get_live_balances", description: "Re-read now (via free public endpoints) the native balances of the largest attacker-held wallets and compare them with the snapshot. Use when asked whether funds moved recently.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },

  // ---- view control (applied in the user's browser) ----
  { name: "focus_address", description: "Move the map camera to an address and open its details panel. Use whenever your answer centres on one address.",
    input_schema: { type: "object", additionalProperties: false, required: ["address"], properties: { address: { type: "string" } } } },
  { name: "highlight_path", description: "Highlight an ordered hop path on the map (dims everything else) and fit it on screen. Pass node ids from trace_path.",
    input_schema: { type: "object", additionalProperties: false, required: ["node_ids"], properties: { node_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 20 } } } },
  { name: "set_filters", description: "Change what the map shows: chains, node states, minimum USD value, and on-chain-only mode. Omitted fields stay as they are.",
    input_schema: { type: "object", additionalProperties: false, properties: {
      chains: { type: "array", items: { type: "string", enum: chainEnum } },
      states: { type: "array", items: { type: "string", enum: stateEnum } },
      min_usd: { type: "number", minimum: 0 }, onchain_only: { type: "boolean" },
      detail: { type: "string", enum: ["key", "all"], description: "key = labelled wallets and anything worth $1M+ (default); all = every traced hop" } } } },
  { name: "set_time", description: "Scrub the map to a moment (ISO UTC between 2026-10-29T20:00:00Z and 2026-10-30T06:30:00Z) so only transfers up to then show. null returns to latest.",
    input_schema: { type: "object", additionalProperties: false, required: ["time"], properties: { time: { type: ["string", "null"] } } } },
  { name: "switch_view", description: "Switch the main view: map, sankey, table (address table), timeline, sources (sources and method).",
    input_schema: { type: "object", additionalProperties: false, required: ["view"], properties: { view: { type: "string", enum: views } } } },
  { name: "reset_view", description: "Reset filters, time, highlight and camera to the default overview.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
];

export const VIEW_TOOLS = new Set(["focus_address", "highlight_path", "set_filters", "set_time", "switch_view", "reset_view"]);

export const TOOL_LABEL: Record<string, string> = {
  get_overview: "Reading totals", search_addresses: "Searching addresses", get_address: "Reading address",
  get_flows: "Reading transfers", trace_path: "Tracing path", get_timeline: "Reading timeline", get_sources: "Checking sources",
  get_live_balances: "Reading live balances", focus_address: "Moving map", highlight_path: "Highlighting path",
  set_filters: "Filtering map", set_time: "Scrubbing time", switch_view: "Switching view", reset_view: "Resetting view",
};

// ---------- input schemas (validate before running anything) ----------
const S = {
  get_overview: z.object({}),
  search_addresses: z.object({ query: z.string().optional(), chain: z.enum(ALL_CHAINS as [Chain, ...Chain[]]).optional(), state: z.enum(ALL_STATES as [NodeState, ...NodeState[]]).optional(), limit: z.number().int().min(1).max(25).optional() }),
  get_address: z.object({ address: z.string().min(3) }),
  get_flows: z.object({ address: z.string().optional(), direction: z.enum(["in", "out", "both"]).optional(), chain: z.enum(ALL_CHAINS as [Chain, ...Chain[]]).optional(), asset: z.string().optional(), kind: z.string().optional(), min_usd: z.number().optional(), limit: z.number().int().min(1).max(30).optional() }),
  trace_path: z.object({ from: z.string().optional(), to: z.string() }),
  get_timeline: z.object({ category: z.string().optional(), start: z.string().optional(), end: z.string().optional(), query: z.string().optional() }),
  get_sources: z.object({ query: z.string().optional() }),
  get_live_balances: z.object({}),
  focus_address: z.object({ address: z.string() }),
  highlight_path: z.object({ node_ids: z.array(z.string()).min(2).max(20) }),
  set_filters: z.object({ chains: z.array(z.enum(ALL_CHAINS as [Chain, ...Chain[]])).optional(), states: z.array(z.enum(ALL_STATES as [NodeState, ...NodeState[]])).optional(), min_usd: z.number().min(0).optional(), onchain_only: z.boolean().optional(), detail: z.enum(["key", "all"]).optional() }),
  set_time: z.object({ time: z.string().nullable() }),
  switch_view: z.object({ view: z.enum(["map", "sankey", "table", "timeline", "sources"]) }),
  reset_view: z.object({}),
} as const;

const round = (v: number | null | undefined) => (v == null ? null : Math.round(v));
const brief = (n: SNode) => ({ id: n.id, title: n.label ?? n.address, chain: n.chain, state: n.state, confidence: n.confidence, held_usd_today: round(n.heldUsd), received_usd_today: round(n.inUsd) });
const edgeOut = (e: SEdge, byId: Map<string, SNode>) => ({
  from: e.from, from_label: byId.get(e.from)?.label ?? null, to: e.to, to_label: byId.get(e.to)?.label ?? null,
  asset: e.asset, amount: e.amount, usd_today: round(e.usd), kind: e.kind, tx_count: e.txCount,
  first: e.firstTime, last: e.lastTime, largest_txs: e.txs.slice(0, 3).map((t) => t.hash),
  confidence: e.confidence, source: e.source, source_url: e.sourceUrl, flags: e.flags.length ? e.flags : undefined,
});

export interface ToolOutcome { content: string; isError?: boolean; action?: AgentAction }

export async function runTool(snap: Snapshot, name: string, raw: unknown): Promise<ToolOutcome> {
  const schema = S[name as keyof typeof S];
  if (!schema) return { content: `Unknown tool ${name}`, isError: true };
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  const a = parsed.data as Record<string, any>;
  const byId = new Map(snap.nodes.map((n) => [n.id, n]));
  const need = (q: string) => { const id = resolveNode(snap, q); if (!id) throw new Error(`No address matching "${q}" in the dataset. Try search_addresses.`); return id; };
  const j = (v: unknown) => ({ content: JSON.stringify(v) });

  try {
    switch (name) {
      case "get_overview":
        return j({
          price_note: snap.meta.priceNote,
          snapshot: snap.meta.dataSnapshot,
          onchain_totals_today_prices: snap.totals.map((t) => ({
            state: t.state, usd: round(t.usd), unpriced: t.unpricedAssets,
            top_items: t.items.slice(0, 6).map((i) => ({ node: i.nodeId, asset: i.asset, amount: Math.round(i.amount), usd: round(i.usd), confidence: i.confidence, note: i.note })),
          })),
          note_on_totals: "Only balance reads at attacker-linked addresses. 'unclassified' hops are NOT in headline totals. DEX/bridge contracts are never counted.",
          reported_stolen_estimates_theft_time: snap.reported.stolenEstimates,
          reported_frozen_claims: snap.reported.frozenClaims,
          reported_moves_not_summed: snap.reported.movements,
          attribution_reported: snap.reported.attribution,
          not_tracked_yet: snap.notTracked,
          chains: snap.chains.map((c) => ({ chain: c.chain, coverage: c.traced, edges: c.edges, first_exploit_tx: c.firstExploitTx, first_exploit_time: c.firstExploitTime, verification: c.firstExploitVerification, balances_read: c.lastUpdated, note: c.note })),
        });
      case "search_addresses": {
        const q = (a.query ?? "").toLowerCase().trim();
        const words = q.split(/\s+/).filter(Boolean);
        const hits = snap.nodes.filter((n) => (!a.chain || n.chain === a.chain) && (!a.state || n.state === a.state)
          && (!words.length || words.every((w: string) => n.address.toLowerCase().includes(w) || (n.label ?? "").toLowerCase().includes(w) || (n.notes ?? "").toLowerCase().includes(w))));
        hits.sort((x, y) => Math.max(y.heldUsd, y.inUsd) - Math.max(x.heldUsd, x.inUsd));
        return j({ total_matches: hits.length, results: hits.slice(0, a.limit ?? 10).map(brief) });
      }
      case "get_address": {
        const n = byId.get(need(a.address))!;
        const ins = snap.edges.filter((e) => e.to === n.id).sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0));
        const outs = snap.edges.filter((e) => e.from === n.id).sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0));
        return j({
          ...brief(n), address: n.address, label: n.label, role: n.role, source: n.source, source_url: n.sourceUrl, notes: n.notes,
          explorer_url: n.explorerUrl, first_seen: n.firstSeen, sent_usd_today: round(n.outUsd), group_members: n.group,
          holdings: n.holdings.map((h) => ({ asset: h.asset, amount: h.amount, usd_today: round(h.usd), state: h.state, confidence: h.confidence, source: h.source, read_utc: h.checkedUtc, note: h.note })),
          inbound: { count: ins.length, top: ins.slice(0, 8).map((e) => edgeOut(e, byId)) },
          outbound: { count: outs.length, top: outs.slice(0, 8).map((e) => edgeOut(e, byId)) },
        });
      }
      case "get_flows": {
        const id = a.address ? need(a.address) : null;
        const dir = a.direction ?? "both";
        const list = snap.edges.filter((e) => (!id || (dir !== "out" && e.to === id) || (dir !== "in" && e.from === id))
          && (!a.chain || e.chain === a.chain) && (!a.asset || e.asset.toLowerCase() === a.asset.toLowerCase())
          && (!a.kind || e.kind === a.kind) && (a.min_usd == null || (e.usd ?? 0) >= a.min_usd));
        list.sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0));
        return j({ total_matches: list.length, usd_note: "usd_today uses today's prices", results: list.slice(0, a.limit ?? 12).map((e) => edgeOut(e, byId)) });
      }
      case "trace_path": {
        const to = need(a.to);
        const ids = a.from ? pathBetween(snap, need(a.from), to) : pathFromSource(snap, to);
        if (ids.length < 2) return j({ node_ids: ids, note: "No traced path found in the dataset (this chain may be reported-only or the hop is untraced)." });
        const hops = ids.slice(0, -1).map((f, i) => snap.edges.filter((e) => e.from === f && e.to === ids[i + 1]).map((e) => edgeOut(e, byId)));
        return j({ node_ids: ids, nodes: ids.map((i) => brief(byId.get(i)!)), hops });
      }
      case "get_timeline": {
        const q = (a.query ?? "").toLowerCase();
        const ev = snap.timeline.filter((e) => (!a.category || e.category === a.category) && (!a.start || e.time >= a.start) && (!a.end || e.time <= a.end)
          && (!q || e.event.toLowerCase().includes(q) || e.source.toLowerCase().includes(q)));
        return j({ count: ev.length, events: ev.slice(0, 30) });
      }
      case "get_sources": {
        const q = (a.query ?? "").toLowerCase();
        const s = snap.sources.filter((x) => !q || `${x.author} ${x.summary} ${x.type}`.toLowerCase().includes(q));
        return j({ count: s.length, sources: s.slice(0, 15) });
      }
      case "get_live_balances": {
        const r = await readLive(snap);
        return j({ read_utc: r.readUtc, by_chain: r.byChain, rows: r.rows.map((x) => ({ node: x.nodeId, asset: x.asset, snapshot: x.snapshot, live: x.live, delta: x.delta, moved: x.moved, endpoint: x.endpoint, error: x.error })) });
      }
      // ---- view tools: validate ids, then hand to the browser ----
      case "focus_address": {
        const id = need(a.address);
        return { content: `Map focused on ${id}.`, action: { type: "focus_address", node_id: id } };
      }
      case "highlight_path": {
        const ids = (a.node_ids as string[]).map(need);
        return { content: `Highlighted ${ids.length} nodes.`, action: { type: "highlight_path", node_ids: ids } };
      }
      case "set_filters":
        return { content: "Filters applied.", action: { type: "set_filters", ...a } as AgentAction };
      case "set_time":
        return { content: a.time ? `Map scrubbed to ${a.time}.` : "Map set to latest.", action: { type: "set_time", time: a.time } };
      case "switch_view":
        return { content: `Switched to ${a.view}.`, action: { type: "switch_view", view: a.view } };
      case "reset_view":
        return { content: "View reset.", action: { type: "reset_view" } };
    }
  } catch (e) {
    return { content: (e as Error).message, isError: true };
  }
  return { content: `Unhandled tool ${name}`, isError: true };
}

export const SYSTEM_PROMPT = `You are Hop, the research assistant on "Trace the Hack", an unofficial, independent dashboard that follows the stolen funds from the October 2026 Binance hot-wallet hack (29–30 Oct 2026). It is not affiliated with Binance or any exchange.

You answer questions about where the funds went and where they sit now, and you drive the dashboard the user is looking at.

How to answer
- Use only what the tools return. Never invent or estimate addresses, amounts, tx hashes or times. If the dataset doesn't cover something (for example untraced chains or hops), say so plainly.
- Give every figure its basis: the source and confidence (verified on-chain, traced on-chain, or reported). For third-party figures, write "reported by X". For attribution, write "attributed by X".
- USD in this dataset uses today's prices, not prices at the time of theft. Published estimates by firms use theft-time prices. Never add the two together, and say which one a figure uses when it matters.
- Totals count only on-chain balance reads. "Unclassified hop" addresses are unreviewed and not in totals. DEX, router, pool and bridge contracts are services, not attacker wallets (for example, TSUUV… is a SunSwap pool). The aUSDT at 0x8d53… is Aave collateral (counted net of its WETH debt), not frozen.
- Neutral, factual tone. You may name public figures and organisations when citing what they posted. Never speculate about who the attacker is beyond what sources attribute ("attributed by X"), and never identify private individuals.
- Be brief: a short paragraph or a compact list. Shorten addresses as 0x8532…3D4 in prose. Use plain markdown (bold, lists); no tables or headings.

Driving the view
- The user sees a flow map (drained wallets on the left, hop columns, chain lanes) with a details panel, plus Sankey, address table, timeline and sources views.
- When an answer centres on one address, call focus_address. When explaining how funds got somewhere, call trace_path and then highlight_path with its node ids. Use set_filters or set_time when the question is about a chain, a state or a moment. Use switch_view when another view answers better.
- View tools only change the screen. Call them alongside or after the data tools, and mention briefly what you showed ("I've highlighted the path on the map").
- Each user message may end with a "Current view" note describing what is on screen. Use it to resolve "this", "here" or "the selected wallet".`;
