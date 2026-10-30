"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveResult, LiveRow } from "@/lib/live";

export interface LiveState {
  results: LiveRow[];
  byChain: LiveResult["byChain"];
  moved: Set<string>;
  readUtc: string | null;
  loading: boolean;
}

export function useLive(intervalMs = 60_000): LiveState {
  const [data, setData] = useState<LiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/live");
        if (r.ok && alive) setData(await r.json());
      } catch { /* keep the last good read */ }
      if (alive) setLoading(false);
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return useMemo(() => ({
    results: data?.rows ?? [],
    byChain: data?.byChain ?? {},
    moved: new Set((data?.rows ?? []).filter((r) => r.moved).map((r) => r.nodeId)),
    readUtc: data?.readUtc ?? null,
    loading,
  }), [data, loading]);
}
