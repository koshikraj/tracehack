// Snapshot data contract (v1). Built by scripts/build-snapshot.ts from ../data only.

export type Chain =
  | "eth" | "tron" | "btc" | "xrp" | "sol" | "arb" | "avalanche" | "polygon";

export type Confidence = "verified-onchain" | "traced-onchain" | "reported" | "unverified";

/** Where a node sits in the story. Drives node colour. */
export type NodeState =
  | "source"              // drained hot wallet (victim)
  | "attacker_held"
  | "frozen"
  | "recovered"
  | "in_lending_position"
  | "commingled"
  | "unclassified"        // traced hop, not yet reviewed (may be market maker / exchange deposit)
  | "service"             // DEX pool, router, bridge, lending contract: never counted as attacker funds
  | "infrastructure"      // attacker operator / contract / gas wallets
  | "related";            // other incident (e.g. Phemex path)

/** State of a specific holding (asset at an address) right now. */
export type FundState =
  | "attacker_held" | "frozen" | "in_lending_position" | "recovered" | "commingled"
  | "freeze_unverified" | "unclassified";

export interface Holding {
  asset: string;
  amount: number;
  usd: number | null;          // today's price (see meta.priceNote); null when no price in snapshot
  state: FundState;
  confidence: Confidence;
  source: string;
  checkedUtc: string | null;
  note?: string;
}

export interface TxRef { hash: string; amount: number; time: string | null }

export interface SNode {
  id: string;                  // `${chain}:${address}` (address lower-cased for EVM)
  chain: Chain;
  address: string;             // display form
  label: string | null;
  role: string;                // raw role from seeds/labels
  state: NodeState;
  confidence: Confidence;
  source: string;
  sourceUrl: string | null;
  notes: string | null;
  holdings: Holding[];
  heldUsd: number;             // sum of holdings with a price
  inUsd: number;               // sum of priced inflow (today's prices)
  outUsd: number;
  depth: number;
  firstSeen: string | null;
  explorerUrl: string | null;
  group?: string[];            // for group nodes: member addresses
  x: number; y: number; r: number;
}

export type EdgeKind = "drain" | "transfer" | "swap" | "lending" | "bridge" | "rescue";

export interface SEdge {
  id: string;
  chain: Chain;
  from: string;                // node id
  to: string;                  // node id
  asset: string;
  amount: number | null;
  usd: number | null;
  txCount: number;
  txs: TxRef[];                // up to 20, largest first
  firstTime: string | null;
  lastTime: string | null;
  kind: EdgeKind;
  confidence: Confidence;
  source: string;
  sourceUrl: string | null;
  flags: string[];
}

export interface TotalItem {
  chain: Chain; asset: string; amount: number; usd: number | null;
  nodeId: string; confidence: Confidence; note?: string;
}

export interface StateTotal {
  state: FundState;
  usd: number;                 // priced items only
  unpricedAssets: string[];
  items: TotalItem[];
}

export interface ReportedFigure {
  label: string; value: string; usd?: number; by: string; url: string | null; time?: string | null;
}

export interface ChainSummary {
  chain: Chain; name: string;
  traced: "edges" | "single-hop" | "reported-only";   // transfers
  balances: "on-chain" | "reported";                 // current balances
  edges: number; nodes: number; firstExploitTx: string | null; firstExploitTime: string | null;
  firstExploitVerification: string; lastUpdated: string | null; note: string;
}

export interface TimelineEvent {
  time: string; event: string; category: string; source: string; sourceUrl: string | null; confidence: string;
}

export interface SourceRef {
  url: string; type: string; author: string; date: string; summary: string;
  /** full-text: article saved in raw/articles; post: X post saved in tweets.json; snippet: only a search snippet or a block page was captured; not-captured: nothing saved */
  capture: "full-text" | "post" | "snippet" | "not-captured";
}

/** Post on X from an organisation or a pseudonymous investigator the plan already cites. */
export interface Post {
  id: string; url: string; handle: string; name: string;
  kind: "official" | "issuer" | "firm" | "investigator" | "protocol" | "news" | "person";
  domain: string | null;       // logo fallback when there is no avatar
  role?: string;               // e.g. "Tether CEO"
  avatar: string | null;       // public X profile picture
  verified: boolean;
  media: string[];             // images attached to the post
  time: string; text: string; likes: number; reposts: number; views: number;
}

export interface Snapshot {
  meta: {
    version: 1;
    builtUtc: string;
    dataSnapshot: string;
    windowStart: string;
    windowEnd: string;
    priceNote: string;
    prices: Record<string, number>;
    disclaimer: string;
  };
  chains: ChainSummary[];
  nodes: SNode[];
  edges: SEdge[];
  totals: StateTotal[];
  notes: { lending: string; dataFixes: string[] };
  reported: {
    stolenEstimates: ReportedFigure[];
    frozenClaims: ReportedFigure[];
    movements: ReportedFigure[];   // swapped / bridged / mixed / exchange: reported only, never summed
    attribution: ReportedFigure[];
  };
  notTracked: { state: string; why: string }[];
  timeline: TimelineEvent[];
  sources: SourceRef[];
  posts: Post[];
  excluded: { sources: { url: string; author: string; reason: string }[]; posts: { id: string; url: string; name: string; text: string; reason: string }[] };
  lanes: { chain: Chain; y0: number; y1: number }[];
  columns: { depth: number; x: number; label: string }[];
}
