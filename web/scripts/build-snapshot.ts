/**
 * Builds web/public/snapshot.json from ../data (read-only).
 * Every number in the output comes from a file in data/; nothing is invented.
 * Run: npm run snapshot
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POST_ACCOUNTS, EXCLUDED_POSTS, OFF_TOPIC_SOURCES, ARTICLE_CAPTURE, isContentFree } from "./accounts";
import type {
  Chain, Confidence, NodeState, FundState, Holding, SNode, SEdge, EdgeKind, StateTotal,
  Snapshot, ChainSummary, TimelineEvent, SourceRef, TxRef, ReportedFigure, Post,
} from "../src/lib/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, "../../data");
const HACK = path.join(DATA, "binance-hack");
const M0 = path.join(DATA, "pipeline-drafts/m0");
const OUT = path.resolve(here, "../public/snapshot.json");

// ---------- io helpers ----------
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const readCsv = (p: string) => parseCsv(fs.readFileSync(p, "utf8"));

const EVM = new Set<Chain>(["eth", "arb", "avalanche", "polygon"]);
const norm = (chain: Chain, a: string) => (EVM.has(chain) ? a.toLowerCase() : a);
const nid = (chain: Chain, a: string) => `${chain}:${norm(chain, a)}`;
/** Plain-language source text for the UI: no file paths or pipeline jargon. */
const PLAIN: [RegExp, string][] = [
  [/raw\/articles\/bitquery_investigation\.txt/gi, "Bitquery investigation"],
  [/eth_state\.json \(public RPC\)/g, "Balance read from an Ethereum node"],
  [/eth_summary\.json \(Blockscout token balances\)/g, "Token balance from the Blockscout explorer"],
  [/eth_summary\.json \(Blockscout\)/g, "Balance from the Blockscout explorer"],
  [/Issuer freeze getter read on-chain \(token_freeze_status\.json \/ eth_state\.json\)/g, "Issuer's freeze status read on-chain"],
  [/Tether blacklist read on TronGrid \(tron_blacklist\.json\)/g, "Tether's freeze list read on Tron"],
  [/(misc_balances|tron_addresses)\.json \(TronGrid\)/g, "Balance read from Tron (TronGrid)"],
  [/btc_addresses\.json \(mempool\.space\)/g, "Balance read from Bitcoin (mempool.space)"],
  [/misc_balances\.json \(xrplcluster\)/g, "Balance read from the XRP Ledger"],
  [/misc_balances\.json \(Solana RPC\)/g, "Balance read from Solana"],
  [/l2_balances\.json \(public RPC\)/g, "Balance read from a public node"],
  [/labels_curated\.csv/g, "address labels"],
  [/tracer \(TronGrid\)/gi, "Traced with TronGrid"],
  [/\b(data|out|raw|m0|pipeline-drafts)\/[\w./-]+/g, "research dataset"],
  [/\b[\w-]+\.(csv|json|md|txt)\b/g, "research dataset"],
];
const plain = (t: string) => PLAIN.reduce((acc, [re, to]) => acc.replace(re, to), t);
const urlIn = (s: string) => s.match(/https?:\/\/[^\s;)]+/)?.[0] ?? null;
const num = (s: string | undefined) => (s && s.trim() !== "" && !isNaN(Number(s)) ? Number(s) : null);

const CHAIN_ALIAS: Record<string, Chain> = {
  eth: "eth", tron: "tron", btc: "btc", xrp: "xrp", sol: "sol", solana: "sol",
  arb: "arb", arbitrum: "arb", avalanche: "avalanche", polygon: "polygon",
};

const EXPLORER: Record<Chain, { addr: string; tx: string }> = {
  eth: { addr: "https://etherscan.io/address/", tx: "https://etherscan.io/tx/" },
  tron: { addr: "https://tronscan.org/#/address/", tx: "https://tronscan.org/#/transaction/" },
  btc: { addr: "https://mempool.space/address/", tx: "https://mempool.space/tx/" },
  xrp: { addr: "https://livenet.xrpl.org/accounts/", tx: "https://livenet.xrpl.org/transactions/" },
  sol: { addr: "https://solscan.io/account/", tx: "https://solscan.io/tx/" },
  arb: { addr: "https://arbiscan.io/address/", tx: "https://arbiscan.io/tx/" },
  avalanche: { addr: "https://snowtrace.io/address/", tx: "https://snowtrace.io/tx/" },
  polygon: { addr: "https://polygonscan.com/address/", tx: "https://polygonscan.com/tx/" },
};

// Public figures may now be named (rule changed by the project owner on 30 Oct 2026), so text passes through as written.
const scrub = (t: string) => t;

// ---------- inputs ----------
const seeds = readCsv(path.join(M0, "seeds_final.csv"));
const labels = readCsv(path.join(HACK, "data/labels_curated.csv"));
const flows = readCsv(path.join(M0, "flows_clean.csv"));
const excluded = readCsv(path.join(M0, "excluded_addresses.csv"));
const timelineRows = readCsv(path.join(HACK, "data/timeline_curated.csv"));
const sourceRows = readCsv(path.join(HACK, "data/sources_curated.csv"));
const firstTx = readCsv(path.join(HACK, "first_exploit_txs.csv"));
const prices = readJson(path.join(HACK, "out/prices.json"));
const ethState = readJson(path.join(HACK, "out/eth_state.json"));
const ethSummary = readJson(path.join(HACK, "out/eth_summary.json"));
const freeze = readJson(path.join(HACK, "out/token_freeze_status.json"));
const tronAddrs = readJson(path.join(HACK, "out/tron_addresses.json"));
const tronBl = readJson(path.join(HACK, "out/tron_blacklist.json"));
const btcAddrs = readJson(path.join(HACK, "out/btc_addresses.json"));
const misc = readJson(path.join(HACK, "out/misc_balances.json"));
const l2 = readJson(path.join(HACK, "out/l2_balances.json"));

const P = {
  ETH: prices.ethereum.usd as number,
  BTC: prices.bitcoin.usd as number,
  XRP: prices.ripple.usd as number,
  SOL: prices.solana.usd as number,
  TRX: prices.tron.usd as number,
  ARB: prices.arbitrum.usd as number,
};
// Stablecoin USD rate: Blockscout USDT rate recorded in eth_summary (same snapshot).
const USDT_RATE: number =
  (ethSummary.balances["0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c"] as any[]).find((b) => b.symbol === "USDT")?.rate ?? 1;

const CHECKED = {
  eth: ethState._checked_utc as string,
  ethFreeze: freeze._checked_utc as string,
  tron: tronBl._checked_utc as string,
  misc: misc._checked_utc as string,
  l2: l2._checked_utc as string,
};

// ---------- registry of known addresses ----------
interface Info { chain: Chain; address: string; role: string; label: string | null; confidence: Confidence; source: string; sourceUrl: string | null; notes: string | null }
const info = new Map<string, Info>();
const asConf = (c: string): Confidence =>
  c.startsWith("verified-onchain") ? "verified-onchain"
    : c.startsWith("traced-onchain") ? "traced-onchain"
      : c.startsWith("reported") ? "reported" : "unverified";

for (const s of seeds) {
  const chain = CHAIN_ALIAS[s.chain];
  if (!chain) continue;
  info.set(nid(chain, s.address), {
    chain, address: s.address, role: s.role, label: null, confidence: asConf(s.confidence),
    source: s.source.replace(/^data\/labels_curated\.csv \(|\)$/g, ""), sourceUrl: urlIn(s.source), notes: s.notes || null,
  });
}
for (const l of labels) {
  const chain = CHAIN_ALIAS[l.chain];
  if (!chain) continue;
  const id = nid(chain, l.address);
  const prev = info.get(id);
  info.set(id, {
    chain, address: l.address, role: prev?.role ?? l.category, label: l.label,
    confidence: asConf(l.confidence), source: l.source, sourceUrl: l.source_url || prev?.sourceUrl || null,
    notes: l.notes || prev?.notes || null,
  });
}
const serviceIds = new Set<string>();
for (const e of excluded) {
  if (!e.reason?.startsWith("service_contract") && e.reason !== "zero_address") continue;
  const chain = CHAIN_ALIAS[e.chain];
  if (chain) serviceIds.add(nid(chain, e.address));
}

const LENDING_ADDR = "eth:0x8d53903625b8e839b9df4bd28b0efb1cd6b8639a";

function stateFor(id: string, role: string, toName?: string): NodeState {
  if (id === LENDING_ADDR) return "in_lending_position";
  if (serviceIds.has(id) || role === "service") return "service";
  switch (role) {
    case "victim": case "victim_hot_wallet": case "victim_or_binance": return "source";
    case "attacker_held": return "attacker_held";
    case "attacker_frozen": return "frozen";
    case "rescued": case "attacker_rescued": return "recovered";
    case "commingled": case "commingled_counterparty": return "commingled";
    case "related_incident": return "related";
    case "operator": case "contract": case "attacker_operator": case "attacker_contract": return "infrastructure";
    case "candidate_hop": return "unclassified";
  }
  if (role.startsWith("attacker_prep")) return "infrastructure";
  if (toName && toName.trim() !== "") return "service";
  return "unclassified";
}

// ---------- nodes ----------
const nodes = new Map<string, SNode>();
function ensureNode(chain: Chain, address: string, extra?: Partial<SNode>, toName?: string): SNode {
  const id = extra?.id ?? nid(chain, address);
  let n = nodes.get(id);
  if (n) return n;
  const i = info.get(id);
  const role = i?.role ?? (toName ? "service" : "unlabelled");
  n = {
    id, chain, address: i?.address ?? address,
    label: i?.label ?? (toName ? toName : null),
    role, state: stateFor(id, role, toName),
    confidence: i?.confidence ?? "traced-onchain",
    source: plain(i?.source ?? (toName ? "Contract name from the Blockscout explorer" : "Found by tracing transfers")),
    sourceUrl: i?.sourceUrl ?? null, notes: i?.notes ?? null,
    holdings: [], heldUsd: 0, inUsd: 0, outUsd: 0, depth: -1, firstSeen: null,
    explorerUrl: id.includes(":group:") ? null : EXPLORER[chain].addr + address,
    x: 0, y: 0, r: 4,
    ...extra,
  };
  nodes.set(id, n);
  return n;
}
// Every labelled / seeded address is a node even if it has no traced edges.
for (const [, i] of info) ensureNode(i.chain, i.address);

// ---------- edges ----------
type Acc = SEdge & { _txs: TxRef[] };
const edges = new Map<string, Acc>();
function addEdge(e: Omit<SEdge, "id" | "txCount" | "txs" | "flags"> & { tx?: TxRef; flags?: string[] }) {
  const key = `${e.from}|${e.to}|${e.asset}`;
  let a = edges.get(key);
  if (!a) {
    a = { ...e, id: key, txCount: 0, txs: [], _txs: [], flags: [], amount: 0, usd: null } as Acc;
    edges.set(key, a);
  }
  if (e.amount != null) a.amount = (a.amount ?? 0) + e.amount; else a.amount = a.amount || null;
  if (e.usd != null) a.usd = (a.usd ?? 0) + e.usd;
  if (e.tx) { a._txs.push(e.tx); a.txCount++; }
  for (const f of e.flags ?? []) if (f && !a.flags.includes(f)) a.flags.push(f);
  if (e.firstTime && (!a.firstTime || e.firstTime < a.firstTime)) a.firstTime = e.firstTime;
  if (e.lastTime && (!a.lastTime || e.lastTime > a.lastTime)) a.lastTime = e.lastTime;
}

const FLOWS_SRC: Record<string, string> = {
  eth: "Transfers traced with the Blockscout explorer, with fake-token and look-alike spam removed",
  tron: "Transfers traced with TronGrid, with dust spam removed",
  btc: "Transfers traced with mempool.space",
};
const verifiedFirst = new Set(firstTx.filter((r) => r.verification.startsWith("verified")).map((r) => r.tx_hash.toLowerCase()));

// Rows whose amount can't be a real transfer (e.g. 1.16e71 USDT = uint256 max / 1e6, a decoded approval).
// The m0 cleanup kept three of these on Tron; they are dropped here and listed in meta.dataFixes.
const IMPOSSIBLE = 1e20;
const dataFixes: string[] = [];
for (const r of flows) {
  const chain = CHAIN_ALIAS[r.chain];
  if ((num(r.amount) ?? 0) > IMPOSSIBLE) {
    dataFixes.push(`Dropped a ${r.chain} ${r.asset} row from ${r.from.slice(0, 6)}… to ${r.to.slice(0, 6)}… (tx ${r.tx_hash.slice(0, 10)}…) with an impossible amount of ${Number(r.amount).toExponential(2)}: a decoding error, not a transfer.`);
    continue;
  }
  const from = ensureNode(chain, r.from);
  const to = ensureNode(chain, r.to, undefined, r.to_name);
  const amount = num(r.amount) ?? 0;
  // The m0 draft priced ERC-20s only; price native coins and Tron USDT from the same snapshot prices.
  const FILL: Record<string, number | undefined> = { "eth:ETH": P.ETH, "btc:BTC": P.BTC, "tron:TRX": P.TRX, "tron:USDT": USDT_RATE };
  const usd = num(r.usd_current_DRAFT) ?? (FILL[`${r.chain}:${r.asset}`] != null ? amount * FILL[`${r.chain}:${r.asset}`]! : null);
  let kind: EdgeKind = from.state === "source" ? "drain" : "transfer";
  const tn = (r.to_name || "").toLowerCase();
  if (to.state === "service") kind = tn.includes("aave") || tn.includes("justlend") ? "lending" : tn.includes("bridge") ? "bridge" : "swap";
  if (to.state === "in_lending_position" && r.asset === "USDT") kind = "transfer";
  addEdge({
    chain, from: from.id, to: to.id, asset: r.asset, amount, usd, kind,
    firstTime: r.timestamp_utc || null, lastTime: r.timestamp_utc || null,
    confidence: verifiedFirst.has(r.tx_hash.toLowerCase()) ? "verified-onchain" : "traced-onchain",
    source: FLOWS_SRC[r.chain], sourceUrl: null,
    tx: { hash: r.tx_hash, amount, time: r.timestamp_utc || null },
    flags: r.flags ? r.flags.split("|") : [],
  });
}

// ETH main drain (verified on-chain in m0/eth_first_exploit_verification.md)
{
  const from = ensureNode("eth", "0x28C6c06298d514Db089934071355E5743bf21d60");
  const to = ensureNode("eth", "0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c");
  const tx = "0x53bd38b816c23e74134786c29a8c18d792777998a3b9326047b583100e88e2f3";
  const t = "2026-10-29T20:24:23Z";
  const base = { chain: "eth" as Chain, from: from.id, to: to.id, kind: "drain" as EdgeKind, firstTime: t, lastTime: t,
    confidence: "verified-onchain" as Confidence, source: "Transaction receipt read from an Ethereum node and checked on the Blockscout explorer", sourceUrl: EXPLORER.eth.tx + tx };
  addEdge({ ...base, asset: "USDT", amount: 1615409498.97324, usd: 1615409498.97324 * USDT_RATE, tx: { hash: tx, amount: 1615409498.97324, time: t },
    flags: ["same tx also moved 61 other ERC-20 tokens (not itemised here)"] });
  addEdge({ ...base, asset: "ETH", amount: 167464.24785655882, usd: 167464.24785655882 * P.ETH, tx: { hash: tx, amount: 167464.24785655882, time: t } });
}

// XRP: Payment txs into rK21 read via xrplcluster (misc_balances.json). Link to the attack: reported (Bitquery).
{
  const recv = "rK21t6nGLy4MNDqhvy3pGwcLFy25qgfzMx";
  const to = ensureNode("xrp", recv);
  for (const t of misc[recv].txs as any[]) {
    if (t.type !== "Payment" || t.to !== recv || !t.amount) continue;
    const xrp = Number(t.amount) / 1e6;
    if (xrp < 1000) continue; // 10-drop pings are not drain payments
    const time = new Date((t.date + 946684800) * 1000).toISOString().replace(".000", "");
    const from = ensureNode("xrp", t.from, {
      role: "victim_hot_wallet", state: "source", confidence: "reported",
      label: "Drained XRP wallet (reported by Bitquery as one of five drained wallets)",
      source: "Payments read from the XRP Ledger; link to the attack reported by Bitquery", sourceUrl: "https://bitquery.io/investigations/binance-hack",
    });
    addEdge({ chain: "xrp", from: from.id, to: to.id, asset: "XRP", amount: xrp, usd: xrp * P.XRP, kind: "drain",
      firstTime: time, lastTime: time, confidence: verifiedFirst.has(t.hash.toLowerCase()) ? "verified-onchain" : "traced-onchain",
      source: "Payment read from the XRP Ledger", sourceUrl: EXPLORER.xrp.tx + t.hash, tx: { hash: t.hash, amount: xrp, time } });
  }
}

// Reported-only hops on chains we have not traced.
const DEVTO = "https://dev.to/thevenice/how-a-53b-binance-hot-wallet-hack-worked-eip-7702-50-signatures-and-a-37-minute-race-2lea";
const BITQUERY = "https://bitquery.io/investigations/binance-hack";
function reportedEdge(chain: Chain, from: SNode, to: SNode, asset: string, amount: number, usd: number | null, time: string | null, source: string, url: string, kind: EdgeKind = "drain") {
  addEdge({ chain, from: from.id, to: to.id, asset, amount, usd, kind, firstTime: time, lastTime: time, confidence: "reported", source, sourceUrl: url, flags: ["no tx hash in dataset"] });
}
{
  // Solana
  const v = ensureNode("sol", "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");
  const r = ensureNode("sol", "AffzFDKZbyMiU11zmVBoAqD25ugpr7xoWWyRyGigBEaU");
  reportedEdge("sol", v, r, "SOL", 970500, 970500 * P.SOL, "2026-10-29T20:10:00Z", "Bitquery (~970.5k SOL, reported)", BITQUERY);

  // Arbitrum: three victims (split unknown) -> 0x3E2b -> Security Council recovery
  const arbVictims = labels.filter((l) => l.chain === "arb" && l.category === "victim");
  const arbGroup = ensureNode("arb", "victims", {
    id: "arb:group:victims", label: `Arbitrum hot wallets (${arbVictims.length}, per-wallet split not in dataset)`,
    role: "victim", state: "source", confidence: "reported", source: "labels_curated.csv; dev.to drain table", sourceUrl: DEVTO,
    group: arbVictims.map((l) => l.address),
  });
  const arbX = ensureNode("arb", "0x3E2bf1ac6bf0934BBba6456C341c2EcbCED632d5");
  arbX.state = "recovered";
  reportedEdge("arb", arbGroup, arbX, "ARB", 74560000, 74560000 * P.ARB, "2026-10-29T20:30:00Z", "dev.to drain table (74.56M ARB, reported)", DEVTO);
  reportedEdge("arb", arbGroup, arbX, "ETH", 8426, 8426 * P.ETH, "2026-10-29T20:30:00Z", "dev.to drain table (8,426 ETH, reported)", DEVTO);
  const council = ensureNode("arb", "recovery", {
    id: "arb:group:recovery", label: "Recovered by Arbitrum Security Council (destination address not in dataset)",
    role: "rescued", state: "recovered", confidence: "reported",
    source: "Arbitrum post on X, via labels_curated.csv; exact tx and time unverified (00:08 / 00:18 / 00:19 UTC by source)",
    sourceUrl: "https://x.com/zachxbt/status/2115960582230913357",
  });
  reportedEdge("arb", arbX, council, "ARB", 74559805, 74559805 * P.ARB, "2026-10-30T00:08:00Z", "labels_curated.csv (74,559,805 ARB)", council.sourceUrl!, "rescue");
  reportedEdge("arb", arbX, council, "ETH", 8425, 8425 * P.ETH, "2026-10-30T00:08:00Z", "labels_curated.csv (8,425 ETH; other sources say 8,426)", council.sourceUrl!, "rescue");
  council.holdings.push(
    { asset: "ARB", amount: 74559805, usd: 74559805 * P.ARB, state: "recovered", confidence: "reported", source: "Arbitrum Security Council action (labels_curated.csv)", checkedUtc: null },
    { asset: "ETH", amount: 8425, usd: 8425 * P.ETH, state: "recovered", confidence: "reported", source: "Arbitrum Security Council action (labels_curated.csv); 8,426 per other sources", checkedUtc: null },
  );

  // Avalanche: four victims -> 0x5227 on C-Chain
  const avVictims = labels.filter((l) => l.chain === "avalanche" && l.category === "victim");
  const avGroup = ensureNode("avalanche", "victims", {
    id: "avalanche:group:victims", label: `Avalanche hot wallets (${avVictims.length}, per-wallet split not in dataset)`,
    role: "victim", state: "source", confidence: "reported", source: "labels_curated.csv; dev.to drain table", sourceUrl: DEVTO,
    group: avVictims.map((l) => l.address),
  });
  const av = ensureNode("avalanche", "0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c", { label: "Primary collection wallet (same address as on Ethereum)", state: "attacker_held", role: "attacker_held" });
  reportedEdge("avalanche", avGroup, av, "AVAX", 2260000, null, "2026-10-29T20:33:18Z", "dev.to drain table (2.26M AVAX, reported)", DEVTO);
  reportedEdge("avalanche", avGroup, av, "USDt", 8410000, 8410000 * USDT_RATE, "2026-10-29T20:33:18Z", "dev.to drain table (8.41M USDt, reported)", DEVTO);

  // Polygon
  const pgSrc = ensureNode("polygon", "source", {
    id: "polygon:group:source", label: "Polygon hot wallet(s) (address not in dataset)", role: "victim", state: "source",
    confidence: "reported", source: "dev.to drain table", sourceUrl: DEVTO,
  });
  const pg = ensureNode("polygon", "0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c", { label: "Primary collection wallet (same address as on Ethereum)", state: "attacker_held", role: "attacker_held" });
  reportedEdge("polygon", pgSrc, pg, "POL", 46600000, null, "2026-10-29T23:05:55Z", "dev.to drain table (46.6M POL, reported)", DEVTO);
  reportedEdge("polygon", pgSrc, pg, "USDT0", 6190000, 6190000 * USDT_RATE, "2026-10-29T23:05:55Z", "dev.to drain table (6.19M USDT0, reported)", DEVTO);
}

// ---------- holdings (on-chain balance reads) ----------
const COUNTED: Partial<Record<NodeState, FundState>> = {
  attacker_held: "attacker_held", frozen: "attacker_held", in_lending_position: "attacker_held",
  commingled: "commingled", unclassified: "unclassified",
};
const CANON = new Set(["ETH", "USDT", "USDC", "WETH", "WBTC", "RLUSD", "DAI"]);
const ascii = /^[A-Za-z0-9.$_-]{1,15}$/;
const fakeTokens = new Set(excluded.filter((e) => e.reason.startsWith("fake")).map((e) => e.address.toLowerCase()));
const CANON_CONTRACT: Record<string, string> = {
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7", USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
};

for (const n of nodes.values()) {
  const base = COUNTED[n.state];
  if (!base || n.id.includes(":group:")) continue;
  const addLower = n.address.toLowerCase();

  if (n.chain === "eth") {
    const st = Object.entries(ethState).find(([k]) => k.toLowerCase() === addLower)?.[1] as any;
    const inf = ethSummary.info[addLower];
    const eth = st?.eth ?? inf?.coin_balance ?? 0;
    if (eth > 0.5) n.holdings.push({ asset: "ETH", amount: eth, usd: eth * P.ETH, state: base, confidence: st ? "verified-onchain" : "traced-onchain",
      source: st ? "eth_state.json (public RPC)" : "eth_summary.json (Blockscout)", checkedUtc: st ? CHECKED.eth : null });
    const fz = Object.entries(freeze).find(([k]) => k.toLowerCase() === addLower)?.[1] as any;
    for (const b of (ethSummary.balances[addLower] ?? []) as any[]) {
      const sym: string = b.symbol;
      if (!(b.amount > 0) || fakeTokens.has(String(b.token).toLowerCase())) continue;
      if (!ascii.test(sym) && sym !== "variableDebtEthWETH") continue;
      if (CANON_CONTRACT[sym] && String(b.token).toLowerCase() !== CANON_CONTRACT[sym]) continue;
      if (CANON.has(sym) && !CANON_CONTRACT[sym] && sym !== "RLUSD") continue;
      let state: FundState = base, conf: Confidence = "traced-onchain", src = "eth_summary.json (Blockscout token balances)", note: string | undefined;
      let usd = b.rate > 0 ? b.amount * b.rate : null;
      if (sym === "variableDebtEthWETH") {
        state = "in_lending_position"; usd = -b.amount * P.ETH; note = "Aave WETH debt; subtracted from the collateral (net position)";
        n.holdings.push({ asset: "WETH debt", amount: -b.amount, usd, state, confidence: conf, source: src, checkedUtc: null, note });
        continue;
      }
      if (usd === null) continue; // unpriced tokens are listed in methodology, not totals
      if (sym === "AUSDT") { state = "in_lending_position"; note = "Aave collateral (encumbered, not issuer-frozen)"; }
      const getter = fz?.[sym];
      const frozenOnchain = (getter && typeof getter === "object" && getter.frozen === true)
        || (sym === "USDT" && st?.usdt_blacklisted) || (sym === "USDC" && st?.usdc_blacklisted);
      if (frozenOnchain && base !== "commingled") { state = "frozen"; conf = "verified-onchain"; src = "Issuer freeze getter read on-chain (token_freeze_status.json / eth_state.json)"; }
      else if (sym === "RLUSD") { state = "frozen"; conf = "reported"; note = "Ripple said it froze this RLUSD; no on-chain freeze getter found, so UNVERIFIED"; }
      if (usd < 1000) continue;
      n.holdings.push({ asset: sym, amount: b.amount, usd, state, confidence: conf, source: src, checkedUtc: state === "frozen" && conf === "verified-onchain" ? CHECKED.ethFreeze : null, note });
    }
  }

  if (n.chain === "tron") {
    const m = misc[n.address], t = tronAddrs[n.address];
    const trx = m?.TRX ?? t?.trx ?? 0, usdt = m?.USDT ?? t?.usdt ?? 0;
    const src = m ? "misc_balances.json (TronGrid)" : "tron_addresses.json (TronGrid)";
    const checked = m ? CHECKED.misc : null;
    if (trx > 1000) n.holdings.push({ asset: "TRX", amount: trx, usd: trx * P.TRX, state: base, confidence: "verified-onchain", source: src, checkedUtc: checked });
    if (usdt > 1000) {
      const bl = tronBl[n.address] === true;
      n.holdings.push({ asset: "USDT", amount: usdt, usd: usdt * USDT_RATE, state: bl ? "frozen" : base, confidence: "verified-onchain",
        source: bl ? "Tether blacklist read on TronGrid (tron_blacklist.json)" : src, checkedUtc: bl ? CHECKED.tron : checked });
    }
  }

  if (n.chain === "btc") {
    const b = btcAddrs[n.address];
    if (b?.balance_btc > 0) n.holdings.push({ asset: "BTC", amount: b.balance_btc, usd: b.balance_btc * P.BTC, state: base,
      confidence: "verified-onchain", source: "btc_addresses.json (mempool.space)", checkedUtc: null, note: "All 19 lots unmoved at the snapshot" });
  }

  if (n.chain === "xrp" && misc[n.address]?.XRP) {
    const x = misc[n.address].XRP;
    n.holdings.push({ asset: "XRP", amount: x, usd: x * P.XRP, state: base, confidence: "verified-onchain", source: "misc_balances.json (xrplcluster)",
      checkedUtc: CHECKED.misc, note: "Balance read on-chain; link to the attack rests on timing and structure (Bitquery), UNVERIFIED" });
  }
  if (n.chain === "sol" && misc[n.address]?.SOL) {
    const s = misc[n.address].SOL;
    n.holdings.push({ asset: "SOL", amount: s, usd: s * P.SOL, state: base, confidence: "verified-onchain", source: "misc_balances.json (Solana RPC)",
      checkedUtc: CHECKED.misc, note: "Balance read on-chain; link to the attack rests on timing and structure (Bitquery), UNVERIFIED" });
  }
  if (n.chain === "avalanche" || n.chain === "polygon") {
    const r = l2["0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c"]?.[n.chain];
    if (r && addLower === "0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c") {
      const nat = n.chain === "avalanche" ? "AVAX" : "POL";
      const st = n.chain === "avalanche" ? "USDT" : "USDT0";
      n.holdings.push({ asset: nat, amount: r.native, usd: null, state: "attacker_held", confidence: "verified-onchain", source: "l2_balances.json (public RPC)",
        checkedUtc: CHECKED.l2, note: `No ${nat} price in the snapshot, so not in USD totals` });
      n.holdings.push({ asset: st, amount: r[st], usd: r[st] * USDT_RATE, state: "freeze_unverified", confidence: "verified-onchain", source: "l2_balances.json (public RPC)",
        checkedUtc: CHECKED.l2, note: "Balance read on-chain; blacklist call reverted, so freeze status is UNVERIFIED" });
    }
  }
}

// Node state refinements from holdings
for (const n of nodes.values()) {
  n.heldUsd = n.holdings.reduce((s, h) => s + (h.usd ?? 0), 0);
  if (n.state === "attacker_held" && n.holdings.length && n.holdings.every((h) => h.state === "frozen")) n.state = "frozen";
  if (n.state === "frozen" && n.holdings.length && !n.holdings.some((h) => h.state === "frozen")) n.state = "attacker_held";
}

// ---------- finalize edges + node flow sums ----------
const edgeList: SEdge[] = [...edges.values()].map(({ _txs, ...e }) => ({
  ...e,
  txs: _txs.sort((a, b) => b.amount - a.amount).slice(0, 20),
}));
for (const e of edgeList) {
  const f = nodes.get(e.from)!, t = nodes.get(e.to)!;
  if (e.usd) { f.outUsd += e.usd; t.inUsd += e.usd; }
  for (const n of [f, t]) if (e.firstTime && (!n.firstSeen || e.firstTime < n.firstSeen)) n.firstSeen = e.firstTime;
}

// Drop isolated non-holding nodes that add nothing (e.g. exclusion-only Binance wallets) but keep labelled attacker nodes.
const touched = new Set(edgeList.flatMap((e) => [e.from, e.to]));
for (const [id, n] of nodes) {
  if (!touched.has(id) && n.holdings.length === 0 && (n.state === "source" || n.state === "service" || n.state === "unclassified")) nodes.delete(id);
}

// ---------- depth (hop distance from drained wallets) ----------
const out = new Map<string, string[]>();
for (const e of edgeList) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
const q: string[] = [];
for (const n of nodes.values()) if (n.state === "source") { n.depth = 0; q.push(n.id); }
while (q.length) {
  const id = q.shift()!;
  const d = nodes.get(id)!.depth;
  for (const t of out.get(id) ?? []) {
    const tn = nodes.get(t);
    if (tn && tn.depth < 0) { tn.depth = d + 1; q.push(t); }
  }
}
// Unreached nodes (e.g. commingled counterparties, operator): place after their earliest known predecessor, else column 1.
for (let pass = 0; pass < 6; pass++) for (const e of edgeList) {
  const f = nodes.get(e.from), t = nodes.get(e.to);
  if (f && t && t.depth < 0 && f.depth >= 0) t.depth = f.depth + 1;
}
for (const n of nodes.values()) if (n.depth < 0) n.depth = n.state === "infrastructure" ? 0 : 1;
const MAXD = 7;
for (const n of nodes.values()) n.depth = Math.min(n.depth, MAXD);

// ---------- layout: packed hop columns inside chain lanes ----------
// Deterministic and map-like: x = hop column, y = lane. Within a column, nodes are ordered by the
// value-weighted y of the nodes that paid them (fewer crossings); tall columns wrap into sub-columns.
const LANE_ORDER: Chain[] = ["eth", "tron", "btc", "xrp", "sol", "arb", "avalanche", "polygon"];
const COLW = 320, GAP = 5, MAX_COL_H = 620, LANE_PAD = 56;
const vmax = Math.max(...[...nodes.values()].map((n) => Math.max(n.heldUsd, n.inUsd)));
for (const n of nodes.values()) {
  // drained wallets hold nothing now, so size them by what they lost
  const v = Math.max(n.heldUsd, n.inUsd, n.state === "source" ? n.outUsd : 0, 0);
  n.r = Math.round((3 + 44 * Math.sqrt(v / vmax)) * 10) / 10;
}
const preds = new Map<string, { id: string; w: number }[]>();
for (const e of edgeList) (preds.get(e.to) ?? preds.set(e.to, []).get(e.to)!).push({ id: e.from, w: Math.log10((e.usd ?? 0) + 10) });
const lanes: Snapshot["lanes"] = [];
let laneTop = 0;
for (const c of LANE_ORDER) {
  const ns = [...nodes.values()].filter((n) => n.chain === c);
  if (!ns.length) continue;
  const relY = new Map<string, number>();  // y relative to lane centre
  let laneHalf = 60;
  for (let d = 0; d <= MAXD; d++) {
    const col = ns.filter((n) => n.depth === d);
    if (!col.length) continue;
    const key = (n: SNode) => {
      const ps = (preds.get(n.id) ?? []).filter((p) => relY.has(p.id));
      if (!ps.length) return -Math.max(n.heldUsd, n.inUsd) / vmax; // roots: biggest first
      const tw = ps.reduce((s, p) => s + p.w, 0);
      return ps.reduce((s, p) => s + relY.get(p.id)! * p.w, 0) / tw;
    };
    const keyed = col.map((n) => ({ n, k: key(n) })).sort((x, y) => x.k - y.k || Math.max(y.n.heldUsd, y.n.inUsd) - Math.max(x.n.heldUsd, x.n.inUsd));
    const total = keyed.reduce((s, { n }) => s + n.r * 2 + GAP, 0);
    const nsub = Math.max(1, Math.ceil(total / MAX_COL_H));
    const per = Math.ceil(keyed.length / nsub);
    const subW = Math.min(46, (COLW * 0.62) / nsub);
    for (let si = 0; si < nsub; si++) {
      const chunk = keyed.slice(si * per, (si + 1) * per);
      const h = chunk.reduce((s, { n }) => s + n.r * 2 + GAP, 0);
      let yy = -h / 2;
      const x = 80 + d * COLW + (si - (nsub - 1) / 2) * subW;
      for (const { n } of chunk) {
        yy += n.r + GAP / 2;
        n.x = Math.round(x);
        relY.set(n.id, yy);
        yy += n.r + GAP / 2;
      }
      laneHalf = Math.max(laneHalf, h / 2);
    }
  }
  const y0 = laneTop, cy = laneTop + LANE_PAD + laneHalf;
  for (const n of ns) n.y = Math.round(cy + relY.get(n.id)!);
  const y1 = cy + laneHalf + LANE_PAD * 0.6;
  lanes.push({ chain: c, y0, y1 });
  laneTop = y1 + 30;
}

const maxDepth = Math.max(...[...nodes.values()].map((n) => n.depth));
const columns = Array.from({ length: maxDepth + 1 }, (_, d) => ({
  depth: d, x: 80 + d * COLW,
  label: d === 0 ? "Drained wallets" : d === 1 ? "First receivers" : d === MAXD ? `Hop ${d}+` : `Hop ${d}`,
}));

// ---------- totals ----------
const STATES: FundState[] = ["attacker_held", "frozen", "in_lending_position", "recovered", "commingled", "freeze_unverified", "unclassified"];
const totals: StateTotal[] = STATES.map((state) => {
  const items = [...nodes.values()].flatMap((n) => n.holdings.filter((h) => h.state === state).map((h) => ({
    chain: n.chain, asset: h.asset, amount: h.amount, usd: h.usd, nodeId: n.id, confidence: h.confidence, note: h.note,
  })));
  return {
    state, items: items.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)),
    usd: items.reduce((s, i) => s + (i.usd ?? 0), 0),
    unpricedAssets: [...new Set(items.filter((i) => i.usd === null).map((i) => `${Math.round(i.amount).toLocaleString("en-US")} ${i.asset}`))],
  };
});

// ---------- reported figures (never summed with on-chain reads) ----------
// Tron lending: TRM reports 300M USDT moved to a wallet that began supplying it to JustLend.
// What our trace shows for that wallet's USDT (computed from the edges, so it stays sourced):
const TPBK = "tron:TPBkSjkCMn2ckrMuAP8n2J1jdjbw76bKN4";
const JUSTLEND = "tron:TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd";
const tpbkUsdt = edgeList.filter((e) => e.from === TPBK && e.asset === "USDT");
const sumTo = (pred: (id: string) => boolean) => tpbkUsdt.filter((e) => pred(e.to)).reduce((a, e) => a + (e.amount ?? 0), 0);
const toJustLend = sumTo((id) => id === JUSTLEND);
const toPools = sumTo((id) => id !== JUSTLEND && nodes.get(id)?.state === "service");
const toFrozen = sumTo((id) => nodes.get(id)?.state === "frozen");
const fmtM = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 2)}M` : v.toLocaleString("en-US");
const lendingNote = `Counts the Aave position only. TRM reports that 300M USDT on Tron went to a wallet that began supplying it to JustLend. Our trace of that wallet (TPBk…) shows ${fmtM(toJustLend)} USDT supplied to JustLend, about ${fmtM(toPools)} USDT sent into SunSwap pools (swapped) and ${fmtM(toFrozen)} USDT sent to a wallet that is now frozen. Its JustLend position hasn't been read on-chain, so it isn't counted here.`;

const reported = {
  stolenEstimates: [
    { label: "Total impact", value: "~$6.3B", usd: 6.3e9, by: "Binance (announcement; captured from a search snippet)", url: "https://www.binance.com/en/support/announcement/detail/c5a8729a97ac486d963784d96c5642d7" },
    { label: "Stolen across 10 chains", value: "$6.36B", usd: 6.36e9, by: "TRM Labs", url: "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history" },
    { label: "Stolen across 9 chains", value: "$6.32B", usd: 6.32e9, by: "Bitquery", url: BITQUERY },
    { label: "Stolen across nine chains", value: "$6.01B", usd: 6.01e9, by: "Arkham", url: null, time: "2026-10-30T04:20:11Z" },
  ],
  frozenClaims: [
    { label: "Verified total frozen", value: "~$3B", usd: 3e9, by: "Binance (X)", url: "https://x.com/binance/status/2115970069696217576", time: "2026-10-30T00:52:32Z" },
    { label: "Frozen on-chain", value: "~$2.7B", usd: 2.7e9, by: "TRM Labs", url: "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history" },
    { label: "Total frozen", value: ">$2.83B", usd: 2.83e9, by: "ZachXBT", url: null, time: "2026-10-30T01:01:24Z" },
    { label: "Frozen", value: "$2.80B", usd: 2.8e9, by: "Arkham", url: null, time: "2026-10-30T04:20:11Z" },
  ],
  movements: [
    { label: "Lending (Tron)", value: `300M USDT went to a wallet that began supplying it to JustLend. Our trace of that wallet shows ${fmtM(toJustLend)} USDT supplied to JustLend and about ${fmtM(toPools)} USDT swapped in SunSwap pools`, by: "TRM Labs", url: "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history" },
    { label: "Swapped", value: "~325M USDT swapped to ~122.3k ETH via UniswapX; Aave and JustLend also used", by: "TRM Labs", url: "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history" },
    { label: "Swapped", value: "Tokens (UNI, ENA, PEPE, LINK, AAVE, ONDO, WLD) dumped for 70,480 ETH", by: "Lookonchain", url: null, time: "2026-10-30T01:01:13Z" },
    { label: "Bridged", value: "Stolen TRX moved through the Bitget Wallet bridge to 0xCd684D22…3396", by: "MistTrack", url: null, time: "2026-10-30T04:17:29Z" },
    { label: "Commingled", value: "Funds commingled with the $388M Bitget exploit at THORChain-out address 0x15104a9c…eb7", by: "ZachXBT", url: null, time: "2026-10-30T04:51:48Z" },
  ],
  attribution: [
    { label: "Attribution", value: "TraderTraitor / DPRK, high confidence", by: "TRM Labs", url: "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history" },
    { label: "Attribution", value: "DPRK, high confidence", by: "Chainalysis", url: null, time: "2026-10-30T04:31:49Z" },
  ],
} satisfies Snapshot["reported"] as Snapshot["reported"];
const notTracked = [
  { state: "mixed", why: "No transfers into a mixer so far. Tornado Cash appears only as the source of the attacker's gas money before the hack." },
  { state: "sent_to_exchange", why: "No destination has a sourced exchange label yet." },
  { state: "swapped / bridged (amounts)", why: "Only reported figures so far; the swap and bridge edges in the map go into DEX, aggregator and bridge contracts (service nodes)." },
];

// ---------- chains ----------
const CHAIN_NAME: Record<Chain, string> = { eth: "Ethereum", tron: "Tron", btc: "Bitcoin", xrp: "XRP Ledger", sol: "Solana", arb: "Arbitrum", avalanche: "Avalanche", polygon: "Polygon" };
const LAST: Record<Chain, string | null> = { eth: CHECKED.ethFreeze, tron: CHECKED.tron, btc: null, xrp: CHECKED.misc, sol: CHECKED.misc, arb: null, avalanche: CHECKED.l2, polygon: CHECKED.l2 };
const chains: ChainSummary[] = LANE_ORDER.filter((c) => lanes.some((l) => l.chain === c)).map((c) => {
  const fx = firstTx.find((r) => CHAIN_ALIAS[r.chain] === c && r.tx_hash !== "TODO");
  return {
    chain: c, name: CHAIN_NAME[c],
    traced: c === "eth" || c === "tron" || c === "btc" ? "edges" : c === "xrp" ? "single-hop" : "reported-only",
    edges: edgeList.filter((e) => e.chain === c).length, nodes: [...nodes.values()].filter((n) => n.chain === c).length,
    firstExploitTx: fx?.tx_hash ?? null, firstExploitTime: fx?.timestamp_utc ?? null,
    // ETH's two first-exploit txs were later verified on-chain (pipeline-drafts/m0/eth_first_exploit_verification.md)
    firstExploitVerification: c === "eth" ? "verified-onchain" : (fx?.verification ?? "TODO / not verified").split(" (")[0],
    lastUpdated: LAST[c],
    balances: [...nodes.values()].some((n) => n.chain === c && n.holdings.some((h) => h.confidence === "verified-onchain")) ? "on-chain" : "reported",
    note: c === "tron" ? "Partly traced: up to three hops, larger transfers only, and transfers inside DEX contracts not followed."
      : c === "eth" ? "Fake-token and look-alike spam removed. The trace stops after a few hops."
        : c === "btc" ? "All 19 output lots were unmoved when balances were read. The read time wasn't recorded."
          : c === "xrp" ? "Balance read on-chain. Transfers not traced past the receiving wallet. Its link to the attack is reported by Bitquery."
            : c === "sol" ? "Balance read on-chain. The drain transfer itself is reported, not yet read. Its link to the attack is reported by Bitquery."
              : c === "arb" ? "Not traced yet (the Arbitrum explorer blocked our requests). Drain and recovery figures are reported."
                : "Balance at the collection wallet read on-chain. The drain transfers are reported, not yet read.",
  };
});

// ---------- timeline + sources ----------
const timeline: TimelineEvent[] = timelineRows.filter((t) => t.category !== "dataset").map((t) => ({
  time: t.time_utc, event: scrub(t.event), category: t.category, source: scrub(t.source), sourceUrl: t.source_url || null, confidence: t.confidence,
}));
const tweetIds = new Set((readJson(path.join(HACK, "tweets.json")) as any[]).map((t) => String(t.id)));
const sources: SourceRef[] = sourceRows.filter((s) => !OFF_TOPIC_SOURCES[s.url]).map((s) => {
  const xId = s.url.match(/x\.com\/\w+\/status\/(\d+)/)?.[1];
  const capture: SourceRef["capture"] = xId ? (tweetIds.has(xId) ? "post" : "not-captured") : ARTICLE_CAPTURE[s.url] ?? "not-captured";
  return { url: s.url, type: s.type, author: scrub(s.author), date: s.date, summary: scrub(s.summary), capture };
});
const excludedSources = sourceRows.filter((s) => OFF_TOPIC_SOURCES[s.url]).map((s) => ({ url: s.url, author: s.author, reason: OFF_TOPIC_SOURCES[s.url] }));

// ---------- posts on X: organisations, cited investigators and public figures (scripts/accounts.ts) ----------
const AVATARS_FILE = path.resolve(here, "../public/avatars/manifest.json");
const avatarManifest: { avatars: Record<string, string>; verified: Record<string, boolean>; media: Record<string, string[]> } =
  fs.existsSync(AVATARS_FILE) ? readJson(AVATARS_FILE) : { avatars: {}, verified: {}, media: {} };
const tweets = readJson(path.join(HACK, "tweets.json")) as any[];
const postExclusionReason = (t: any): string | null =>
  EXCLUDED_POSTS[t.id] ?? (isContentFree(String(t.text).replace(/https:\/\/t\.co\/\w+/g, ""), (avatarManifest.media[t.id] ?? []).length > 0) ? "No content beyond a mention, emoji or a thank-you" : null);
const excludedPosts = tweets
  .filter((t) => POST_ACCOUNTS[t.author] && !t.is_retweet && t.created_at_utc >= "2026-10-29T19:00:00" && postExclusionReason(t))
  .map((t) => ({ id: t.id, url: t.url, name: POST_ACCOUNTS[t.author].name, text: String(t.text).replace(/https:\/\/t\.co\/\w+/g, "").trim().slice(0, 140), reason: postExclusionReason(t)! }));
const posts: Post[] = tweets
  .filter((t) => POST_ACCOUNTS[t.author] && !t.is_retweet && !postExclusionReason(t))
  .map((t) => ({
    id: t.id, url: t.url, handle: t.author,
    name: POST_ACCOUNTS[t.author].name, kind: POST_ACCOUNTS[t.author].kind, domain: POST_ACCOUNTS[t.author].domain, role: POST_ACCOUNTS[t.author].role,
    avatar: POST_ACCOUNTS[t.author].avatar === false ? null : avatarManifest.avatars[t.author] ?? null,
    verified: avatarManifest.verified[t.author] ?? false,
    media: POST_ACCOUNTS[t.author].avatar === false ? [] : avatarManifest.media[t.id] ?? [],
    time: t.created_at_utc.replace(".000Z", "Z"),
    text: scrub(String(t.text).replace(/https:\/\/t\.co\/\w+/g, "").trim()),
    likes: t.metrics?.like_count ?? 0, reposts: t.metrics?.retweet_count ?? 0, views: t.metrics?.impression_count ?? 0,
  }))
  .filter((p) => p.time >= "2026-10-29T19:00:00Z")
  .sort((a, b) => a.time.localeCompare(b.time));

// Plain-language pass: no file paths or pipeline jargon reach the UI.
for (const n of nodes.values()) {
  n.source = plain(n.source); n.notes = n.notes && plain(n.notes);
  for (const h of n.holdings) { h.source = plain(h.source); if (h.note) h.note = plain(h.note); }
}
for (const e of edgeList) e.source = plain(e.source);

const snapshot: Snapshot = {
  meta: {
    version: 1,
    builtUtc: new Date().toISOString(),
    dataSnapshot: "Balances read 06:11–06:29 UTC on 30 Oct 2026",
    windowStart: "2026-10-29T20:00:00Z",
    windowEnd: "2026-10-30T06:30:00Z",
    priceNote: "Dollar values use prices from 30 Oct (CoinGecko, and the Blockscout explorer for tokens), not prices at the moment of theft. Firms' totals use theft-time prices, so the two aren't directly comparable.",
    prices: { ...P, USDT: USDT_RATE },
    disclaimer: "Unofficial. Not affiliated with Binance or any exchange. Data is from public blockchains and public reports; it may be incomplete or wrong.",
  },
  chains,
  nodes: [...nodes.values()],
  edges: edgeList,
  totals,
  notes: { lending: lendingNote, dataFixes },
  reported,
  notTracked,
  timeline,
  sources,
  posts,
  excluded: { sources: excludedSources, posts: excludedPosts },
  lanes,
  columns,
};

fs.writeFileSync(OUT, JSON.stringify(snapshot));
const sz = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${OUT} (${sz} KB): ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges, ${sources.length} sources (${excludedSources.length} off-topic left out), ${posts.length} posts (${excludedPosts.length} left out)`);
for (const t of totals) console.log(`  ${t.state.padEnd(20)} $${(t.usd / 1e6).toFixed(1)}M  items=${t.items.length} unpriced=${t.unpricedAssets.join(", ")}`);
