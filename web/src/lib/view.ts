import type { Chain, NodeState } from "./types";

export type ViewName = "map" | "sankey" | "table" | "timeline" | "sources";

export const ALL_CHAINS: Chain[] = ["eth", "tron", "btc", "xrp", "sol", "arb", "avalanche", "polygon"];
export const ALL_STATES: NodeState[] = [
  "source", "attacker_held", "frozen", "recovered", "in_lending_position", "commingled",
  "unclassified", "service", "infrastructure", "related",
];

export interface ViewState {
  view: ViewName;
  chains: Chain[];
  states: NodeState[];
  minUsd: number;
  /** "key": labelled wallets and anything worth $1M+; "all": every traced hop */
  detail: "key" | "all";
  onchainOnly: boolean;
  time: number | null;          // ms epoch; null = latest
  selected: string | null;      // node id
  highlight: string[];          // ordered node ids (path)
  focusNonce: number;           // bump to re-run focus animation
  fitNonce: number;
}

export const initialView: ViewState = {
  view: "map",
  chains: ALL_CHAINS,
  states: ALL_STATES.filter((s) => s !== "related"),
  minUsd: 0,
  detail: "key",
  onchainOnly: false,
  time: null,
  selected: null,
  highlight: [],
  focusNonce: 0,
  fitNonce: 0,
};

/** Actions the chat agent may emit. The client validates and applies them. */
export type AgentAction =
  | { type: "focus_address"; node_id: string }
  | { type: "highlight_path"; node_ids: string[] }
  | { type: "set_filters"; chains?: Chain[]; states?: NodeState[]; min_usd?: number; onchain_only?: boolean; detail?: "key" | "all" }
  | { type: "set_time"; time: string | null }
  | { type: "switch_view"; view: ViewName }
  | { type: "reset_view" };

export type ViewAction =
  | AgentAction
  | { type: "select"; node_id: string | null }
  | { type: "toggle_chain"; chain: Chain }
  | { type: "toggle_state"; state: NodeState }
  | { type: "set_min_usd"; value: number }
  | { type: "set_detail"; value: "key" | "all" }
  | { type: "set_onchain_only"; value: boolean }
  | { type: "set_time_ms"; value: number | null };

export function reduceView(s: ViewState, a: ViewAction): ViewState {
  switch (a.type) {
    case "focus_address":
      return { ...s, view: "map", selected: a.node_id, focusNonce: s.focusNonce + 1,
        chains: s.chains.includes(a.node_id.split(":")[0] as Chain) ? s.chains : [...s.chains, a.node_id.split(":")[0] as Chain] };
    case "highlight_path":
      return { ...s, view: "map", highlight: a.node_ids, selected: a.node_ids.at(-1) ?? s.selected, fitNonce: s.fitNonce + 1 };
    case "set_filters":
      return {
        ...s,
        chains: a.chains?.length ? a.chains : s.chains,
        states: a.states?.length ? a.states : s.states,
        minUsd: a.min_usd ?? s.minUsd,
        onchainOnly: a.onchain_only ?? s.onchainOnly,
        detail: a.detail ?? s.detail,
      };
    case "set_time":
      return { ...s, time: a.time ? Date.parse(a.time) : null };
    case "set_time_ms":
      return { ...s, time: a.value };
    case "switch_view":
      return { ...s, view: a.view };
    case "reset_view":
      return { ...initialView, fitNonce: s.fitNonce + 1 };
    case "select":
      return { ...s, selected: a.node_id, highlight: a.node_id && s.highlight.includes(a.node_id) ? s.highlight : [] };
    case "toggle_chain":
      return { ...s, chains: s.chains.includes(a.chain) ? s.chains.filter((c) => c !== a.chain) : [...s.chains, a.chain] };
    case "toggle_state":
      return { ...s, states: s.states.includes(a.state) ? s.states.filter((c) => c !== a.state) : [...s.states, a.state] };
    case "set_min_usd":
      return { ...s, minUsd: a.value };
    case "set_detail":
      return { ...s, detail: a.value, fitNonce: s.fitNonce + 1 };
    case "set_onchain_only":
      return { ...s, onchainOnly: a.value };
  }
}
