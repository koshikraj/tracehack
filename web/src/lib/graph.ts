import type { Snapshot, SEdge } from "./types";

/** Shortest hop path (by edge count) from any drained wallet to `target`. Returns node ids source → target. */
export function pathFromSource(snap: Snapshot, target: string): string[] {
  const inc = new Map<string, SEdge[]>();
  for (const e of snap.edges) (inc.get(e.to) ?? inc.set(e.to, []).get(e.to)!).push(e);
  const states = new Map(snap.nodes.map((n) => [n.id, n.state]));
  const prev = new Map<string, string | null>([[target, null]]);
  const q = [target];
  while (q.length) {
    const id = q.shift()!;
    if (states.get(id) === "source") {
      const path = [id];
      let cur = prev.get(id);
      while (cur) { path.push(cur); cur = prev.get(cur) ?? null; }
      return path;
    }
    // prefer larger inbound flows first so the path follows the money
    const ins = (inc.get(id) ?? []).slice().sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    for (const e of ins) if (!prev.has(e.from)) { prev.set(e.from, id); q.push(e.from); }
  }
  return [target];
}

/** Shortest directed path between two nodes, or [] if none. */
export function pathBetween(snap: Snapshot, from: string, to: string): string[] {
  const out = new Map<string, string[]>();
  for (const e of snap.edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const id = q.shift()!;
    if (id === to) {
      const p: string[] = [];
      let c: string | null = id;
      while (c) { p.unshift(c); c = prev.get(c) ?? null; }
      return p;
    }
    for (const t of out.get(id) ?? []) if (!prev.has(t)) { prev.set(t, id); q.push(t); }
  }
  return [];
}

/** Resolve user/model input (full id, address, or address prefix/suffix) to a node id. */
export function resolveNode(snap: Snapshot, q: string): string | null {
  const s = q.trim();
  if (!s) return null;
  const exact = snap.nodes.find((n) => n.id === s || n.id.toLowerCase() === s.toLowerCase());
  if (exact) return exact.id;
  const lower = s.toLowerCase().replace(/…|\.\.\./g, "…");
  const byAddr = snap.nodes.filter((n) => n.address.toLowerCase() === lower);
  if (byAddr.length) return byAddr.sort((a, b) => b.heldUsd + b.inUsd - (a.heldUsd + a.inUsd))[0].id;
  if (lower.includes("…")) {
    const [pre, suf] = lower.split("…");
    const m = snap.nodes.filter((n) => n.address.toLowerCase().startsWith(pre) && n.address.toLowerCase().endsWith(suf));
    if (m.length) return m.sort((a, b) => b.heldUsd + b.inUsd - (a.heldUsd + a.inUsd))[0].id;
  }
  if (lower.length >= 6) {
    const m = snap.nodes.filter((n) => n.address.toLowerCase().startsWith(lower));
    if (m.length) return m.sort((a, b) => b.heldUsd + b.inUsd - (a.heldUsd + a.inUsd))[0].id;
  }
  return null;
}
