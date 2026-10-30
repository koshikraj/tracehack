// Server-only: re-reads balances of the largest attacker-held wallets from free public endpoints (no keys).
import type { Chain, Snapshot } from "./types";

export interface LiveRow {
  nodeId: string; chain: Chain; address: string; asset: string;
  snapshot: number; live: number | null; delta: number | null; moved: boolean;
  readUtc: string; endpoint: string; error?: string;
}
export interface LiveResult { readUtc: string; rows: LiveRow[]; byChain: Record<string, { status: "moved" | "unchanged" | "unavailable"; readUtc: string }> }

const ENDPOINT = {
  eth: "https://ethereum-rpc.publicnode.com",
  btc: "https://mempool.space/api/address/",
  tron: "https://api.trongrid.io/v1/accounts/",
  xrp: "https://xrplcluster.com/",
  sol: "https://api.mainnet-beta.solana.com",
};
const TOL: Record<string, number> = { ETH: 0.01, BTC: 0.0001, TRX: 1, XRP: 1, SOL: 0.01 };

async function j(url: string, init?: RequestInit, retry = 1): Promise<any> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (r.status === 429 && retry > 0) { await new Promise((ok) => setTimeout(ok, 1500)); return j(url, init, retry - 1); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(to); }
}

type Target = { nodeId: string; chain: Chain; address: string; asset: string; snapshot: number };

function targets(snap: Snapshot): Target[] {
  const out: Target[] = [];
  for (const n of snap.nodes) {
    if (n.state !== "attacker_held" && n.state !== "frozen") continue;
    for (const h of n.holdings) {
      const native = (n.chain === "eth" && h.asset === "ETH") || (n.chain === "btc" && h.asset === "BTC") || (n.chain === "tron" && h.asset === "TRX")
        || (n.chain === "xrp" && h.asset === "XRP") || (n.chain === "sol" && h.asset === "SOL");
      if (native && (h.usd ?? 0) > 1e6) out.push({ nodeId: n.id, chain: n.chain, address: n.address, asset: h.asset, snapshot: h.amount });
    }
  }
  return out;
}

async function readOne(t: Target): Promise<number> {
  switch (t.chain) {
    case "eth": {
      const r = await j(ENDPOINT.eth, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [t.address, "latest"] }) });
      return Number(BigInt(r.result)) / 1e18;
    }
    case "btc": {
      const r = await j(ENDPOINT.btc + t.address);
      const c = r.chain_stats, m = r.mempool_stats;
      return (c.funded_txo_sum - c.spent_txo_sum + m.funded_txo_sum - m.spent_txo_sum) / 1e8;
    }
    case "tron": {
      const r = await j(ENDPOINT.tron + t.address);
      return (r.data?.[0]?.balance ?? 0) / 1e6;
    }
    case "xrp": {
      const r = await j(ENDPOINT.xrp, { method: "POST", body: JSON.stringify({ method: "account_info", params: [{ account: t.address, ledger_index: "validated" }] }) });
      return Number(r.result.account_data.Balance) / 1e6;
    }
    case "sol": {
      const r = await j(ENDPOINT.sol, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [t.address] }) });
      return r.result.value / 1e9;
    }
    default: throw new Error("unsupported chain");
  }
}

let cache: { at: number; value: LiveResult } | null = null;
let inflight: Promise<LiveResult> | null = null;
const TTL = 60_000;

export async function readLive(snap: Snapshot): Promise<LiveResult> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    const ts = targets(snap);
    const rows: LiveRow[] = [];
    // modest concurrency to stay polite with free endpoints
    for (let i = 0; i < ts.length; i += 6) {
      const batch = await Promise.all(ts.slice(i, i + 6).map(async (t) => {
        const readUtc = new Date().toISOString();
        const endpoint = new URL(ENDPOINT[t.chain as keyof typeof ENDPOINT]).host;
        try {
          const live = await readOne(t);
          const delta = live - t.snapshot;
          return { ...t, live, delta, // ignore dust: needs to clear both an absolute floor and 0.05% of the snapshot balance
          moved: Math.abs(delta) > Math.max(TOL[t.asset] ?? 0, t.snapshot * 0.0005), readUtc, endpoint };
        } catch (e) {
          return { ...t, live: null, delta: null, moved: false, readUtc, endpoint, error: (e as Error).message };
        }
      }));
      rows.push(...batch);
    }
    const byChain: LiveResult["byChain"] = {};
    for (const r of rows) {
      const cur = byChain[r.chain];
      const status = r.error ? "unavailable" : r.moved ? "moved" : "unchanged";
      if (!cur || status === "moved" || (cur.status === "unavailable" && status === "unchanged")) byChain[r.chain] = { status, readUtc: r.readUtc };
    }
    const value = { readUtc: new Date().toISOString(), rows, byChain };
    cache = { at: Date.now(), value };
    return value;
  })().finally(() => { inflight = null; });
  return inflight;
}
