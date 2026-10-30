import type { Chain, Confidence, FundState, NodeState } from "./types";

export const CHAIN_NAME: Record<Chain, string> = {
  eth: "Ethereum", tron: "Tron", btc: "Bitcoin", xrp: "XRP Ledger", sol: "Solana",
  arb: "Arbitrum", avalanche: "Avalanche", polygon: "Polygon",
};
export const CHAIN_SHORT: Record<Chain, string> = {
  eth: "ETH", tron: "TRON", btc: "BTC", xrp: "XRP", sol: "SOL", arb: "ARB", avalanche: "AVAX", polygon: "POL",
};

/** CSS custom property per node state; values live in globals.css (light + dark). */
export const STATE_VAR: Record<NodeState | FundState, string> = {
  attacker_held: "--st-held",
  frozen: "--st-frozen",
  freeze_unverified: "--st-frozen-unv",
  recovered: "--st-recovered",
  in_lending_position: "--st-lending",
  commingled: "--st-commingled",
  unclassified: "--st-unclassified",
  service: "--st-service",
  source: "--st-source",
  infrastructure: "--st-infra",
  related: "--st-related",
};

export const STATE_LABEL: Record<NodeState | FundState, string> = {
  attacker_held: "Held by attacker",
  frozen: "Frozen by issuer",
  freeze_unverified: "Freeze status unknown",
  recovered: "Recovered",
  in_lending_position: "In lending position",
  commingled: "Commingled",
  unclassified: "Unclassified hop",
  service: "DEX / bridge / contract",
  source: "Drained Binance wallet",
  infrastructure: "Attacker infrastructure",
  related: "Other incident",
};

export const STATE_HELP: Partial<Record<NodeState | FundState, string>> = {
  attacker_held: "Balance read on-chain at an attacker-linked address; not frozen.",
  frozen: "Issuer freeze getter reads true on-chain, or the issuer said so publicly (marked reported).",
  freeze_unverified: "Balance read on-chain, but the issuer's blacklist call reverted, so we can't confirm a freeze.",
  recovered: "Moved out of attacker control by a governance body (reported).",
  in_lending_position: "Aave collateral minus the WETH borrowed against it (net).",
  commingled: "Mixed with funds from other incidents at the same address.",
  unclassified: "Traced hop not yet reviewed: could be the attacker, a market maker or an exchange deposit. Not in the totals.",
  service: "DEX pool, router, bridge or lending contract. Never counted as attacker funds.",
};

export const CONF_LABEL: Record<Confidence, string> = {
  "verified-onchain": "Verified on-chain",
  "traced-onchain": "Traced on-chain",
  reported: "Reported",
  unverified: "Unverified",
};

export function usd(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (opts.compact !== false) {
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  }
  return `${s}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function amt(v: number | null | undefined, asset?: string): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const digits = a >= 1000 ? 0 : a >= 1 ? 2 : 6;
  const s = v.toLocaleString("en-US", { maximumFractionDigits: digits });
  return asset ? `${s} ${asset}` : s;
}

export function compactAmt(v: number, asset?: string): string {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(a >= 1 ? 1 : 4);
  return asset ? `${s} ${asset}` : s;
}

export function short(addr: string, n = 6): string {
  if (addr.length <= n * 2 + 1) return addr;
  return `${addr.slice(0, n)}…${addr.slice(-4)}`;
}

export function utc(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hm = d.toISOString().slice(11, 16);
  if (!withDate) return `${hm} UTC`;
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${day} ${hm} UTC`;
}

export function nodeTitle(n: { label: string | null; address: string; state: NodeState }): string {
  if (/^0x0{40}$/.test(n.address)) return "Zero address (mint / burn)";
  return n.label ?? (n.state === "service" ? "Contract" : short(n.address));
}
