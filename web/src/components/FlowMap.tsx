"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { Minus, Plus, Scan } from "lucide-react";
import type { Snapshot, SNode, SEdge, NodeState, Chain } from "@/lib/types";
import type { ViewState, ViewAction } from "@/lib/view";
import { CHAIN_NAME, STATE_VAR, usd, nodeTitle, short, utc, compactAmt } from "@/lib/format";
import { BINANCE_LOGO, BinanceLogo, ChainIcon, TokenIcon, isBinanceWallet, tokenIconUrl } from "./icons";
import { StateBadge } from "./ui";

type Theme = Record<string, string> & { font: string; display: string; dark: boolean };

function readTheme(el: Element): Theme {
  const cs = getComputedStyle(el);
  const t: Record<string, string> = {};
  for (const v of ["--surface", "--map", "--map-dot", "--ink", "--ink-2", "--muted", "--line", "--line-2", "--lane-a", "--lane-b", "--focus",
    ...Object.values(STATE_VAR)]) t[v] = cs.getPropertyValue(v).trim();
  const plex = cs.getPropertyValue("--font-plex").trim();
  const cond = cs.getPropertyValue("--font-plex-cond").trim();
  return { ...t, font: `${plex}, system-ui, sans-serif`, display: `${cond}, ${plex}, sans-serif`, dark: cs.colorScheme === "dark" } as Theme;
}

function withAlpha(hex: string, a: number) {
  if (!hex.startsWith("#")) return hex;
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

interface Geo { e: SEdge; x1: number; y1: number; x2: number; y2: number; c1x: number; c1y: number; c2x: number; c2y: number; len: number; w: number; t0: number }

/** Width of the map not covered by the details drawer (380px + margins). */
const drawerInset = (w: number, selected: string | null) => (selected && w > 760 ? w - 404 : w);
const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

function bez(g: Geo, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * g.x1 + 3 * u * u * t * g.c1x + 3 * u * t * t * g.c2x + t * t * t * g.x2,
    y: u * u * u * g.y1 + 3 * u * u * t * g.c1y + 3 * u * t * t * g.c2y + t * t * t * g.y2,
  };
}

/** Wallets shown in "Key wallets" mode: anything labelled, any non-hop state, or $1M+ of value. */
export const isKey = (n: SNode) =>
  (n.state !== "unclassified" && n.state !== "service") || Math.max(n.heldUsd, n.inUsd) >= 1e6;

/** The asset that dominates a node's value, for the glyph inside large stops. */
function mainAsset(n: SNode, edges: SEdge[]): string | null {
  if (n.holdings.length) return [...n.holdings].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))[0].asset;
  let best: SEdge | null = null;
  for (const e of edges) if (e.to === n.id && (!best || (e.usd ?? 0) > (best.usd ?? 0))) best = e;
  return best?.asset ?? null;
}

export interface FlowMapProps {
  snap: Snapshot;
  view: ViewState;
  dispatch: (a: ViewAction) => void;
  moved: Set<string>;
}

export default function FlowMap({ snap, view, dispatch, moved }: FlowMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef<ZoomTransform>(zoomIdentity);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const sizeRef = useRef({ w: 800, h: 600 });
  const hoverRef = useRef<string | null>(null);
  const themeRef = useRef<Theme | null>(null);
  const appearRef = useRef(new Map<string, number>());
  const imgRef = useRef(new Map<string, HTMLImageElement>());
  const gradRef = useRef(new Map<string, CanvasGradient>());
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const reduced = useRef(false);

  const nodeById = useMemo(() => new Map(snap.nodes.map((n) => [n.id, n])), [snap]);
  const glyph = useMemo(() => new Map(snap.nodes.map((n) => [n.id, mainAsset(n, snap.edges)])), [snap]);
  const maxEdgeUsd = useMemo(() => Math.max(...snap.edges.map((e) => e.usd ?? 0)), [snap]);

  const geos = useMemo<Geo[]>(() => snap.edges.map((e) => {
    const a = nodeById.get(e.from)!, b = nodeById.get(e.to)!;
    const x1 = a.x + a.r, y1 = a.y, x2 = b.x - b.r, y2 = b.y;
    let dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
    let c1x = x1 + dx, c2x = x2 - dx, c1y = y1, c2y = y2;
    if (x2 <= x1) { dx = 120; c1x = x1 + dx; c2x = x2 - dx; c1y = y1 - 80; c2y = y2 - 80; }
    const len = Math.hypot(x2 - x1, y2 - y1) + 40;
    const w = 1.1 + 13 * Math.sqrt((e.usd ?? 0) / maxEdgeUsd);
    return { e, x1, y1, x2, y2, c1x, c1y, c2x, c2y, len, w, t0: e.firstTime ? Date.parse(e.firstTime) : 0 };
  }), [snap, nodeById, maxEdgeUsd]);

  // ---------- visibility ----------
  const vis = useMemo(() => {
    const t = view.time ?? Infinity;
    const states = new Set<NodeState>(view.states);
    const chains = new Set(view.chains);
    const pinned = new Set([...view.highlight, ...(view.selected ? [view.selected] : [])]);
    const nodes = new Set<string>();
    for (const n of snap.nodes) {
      if (pinned.has(n.id)) { nodes.add(n.id); continue; }
      if (!chains.has(n.chain) || !states.has(n.state)) continue;
      if (view.onchainOnly && n.confidence === "reported") continue;
      if (Math.max(n.heldUsd, n.inUsd) < view.minUsd && n.state !== "source") continue;
      if (view.detail === "key" && !isKey(n)) continue;
      if (n.firstSeen && Date.parse(n.firstSeen) > t && n.state !== "source") continue;
      nodes.add(n.id);
    }
    const edges = geos.filter((g) => nodes.has(g.e.from) && nodes.has(g.e.to) && g.t0 <= t
      && !(view.onchainOnly && g.e.confidence === "reported"));
    return { nodes, edges };
  }, [snap, geos, view.time, view.states, view.chains, view.minUsd, view.onchainOnly, view.detail, view.highlight, view.selected]);

  const visRef = useRef(vis); visRef.current = vis;
  const viewRef = useRef(view); viewRef.current = view;
  const movedRef = useRef(moved); movedRef.current = moved;

  const pathEdges = useMemo(() => {
    const s = new Set<string>();
    const h = view.highlight;
    for (let i = 0; i < h.length - 1; i++) for (const e of snap.edges) if (e.from === h[i] && e.to === h[i + 1]) s.add(e.id);
    return s;
  }, [view.highlight, snap]);
  const pathRef = useRef(pathEdges); pathRef.current = pathEdges;

  // ---------- camera ----------
  const animateTo = (target: ZoomTransform, ms = 950) => {
    const canvas = canvasRef.current, z = zoomRef.current;
    if (!canvas || !z) return;
    const from = tRef.current, start = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const lk0 = Math.log(from.k), lk1 = Math.log(target.k);
    const dur = reduced.current ? 0 : ms;
    const { w, h } = sizeRef.current;
    const cx0 = (w / 2 - from.x) / from.k, cy0 = (h / 2 - from.y) / from.k;
    const cx1 = (w / 2 - target.x) / target.k, cy1 = (h / 2 - target.y) / target.k;
    // zoom out a little mid-flight on long moves, like a map camera
    const dist = Math.hypot(cx1 - cx0, cy1 - cy0) * Math.min(from.k, target.k);
    const dip = Math.min(0.45, dist / (w * 3));
    const step = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur), e = ease(p);
      const k = Math.exp(lk0 + (lk1 - lk0) * e) * (1 - dip * Math.sin(Math.PI * p));
      const cx = cx0 + (cx1 - cx0) * e, cy = cy0 + (cy1 - cy0) * e;
      z.transform(select(canvas), zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const fitTo = (ids: Iterable<string>, pad = 70, maxK = 2.5) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const n = nodeById.get(id); if (!n) continue;
      x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r + 160); y1 = Math.max(y1, n.y + n.r);
    }
    if (!isFinite(x0)) return;
    const { w: fullW, h } = sizeRef.current;
    const w = drawerInset(fullW, viewRef.current.selected);
    const k = Math.min(maxK, (w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0));
    animateTo(zoomIdentity.translate(w / 2 - ((x0 + x1) / 2) * k, h / 2 - ((y0 + y1) / 2) * k).scale(k));
  };
  const fitRef = useRef(fitTo); fitRef.current = fitTo;

  // ---------- setup: canvas, zoom, theme, images, render loop ----------
  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onTheme = () => { themeRef.current = readTheme(document.documentElement); gradRef.current.clear(); };
    onTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", onTheme);
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.fonts?.ready.then(onTheme);

    // preload chain + token glyphs
    const want = new Set<string>([...snap.lanes.map((l) => `/icons/chains/${l.chain}.svg`), BINANCE_LOGO]);
    for (const a of glyph.values()) { const u = a && tokenIconUrl(a); if (u) want.add(u); }
    for (const src of want) { const im = new Image(); im.src = src; imgRef.current.set(src, im); }

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`; canvas.style.height = `${r.height}px`;
    });
    ro.observe(wrap);

    let lastPct = 0;
    const z = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.04, 10])
      .clickDistance(4)
      .on("zoom", (ev) => {
        tRef.current = ev.transform;
        const pct = Math.round(ev.transform.k * 100);
        if (pct !== lastPct) { lastPct = pct; setZoomPct(pct); }
      });
    zoomRef.current = z;
    select(canvas).call(z).on("dblclick.zoom", null);

    const img = (src: string | null) => { if (!src) return null; const im = imgRef.current.get(src); return im?.complete && im.naturalWidth ? im : null; };

    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const th = themeRef.current!; const ctx = canvas.getContext("2d")!;
      const { w, h } = sizeRef.current; const dpr = window.devicePixelRatio || 1;
      const t = tRef.current; const k = t.k;
      const v = viewRef.current; const V = visRef.current; const PE = pathRef.current;
      const hov = hoverRef.current;
      const hasPath = v.highlight.length > 1;
      const pinned = new Set(v.highlight);
      const hovNbrs = new Set<string>();
      if (hov) for (const g of V.edges) { if (g.e.from === hov) hovNbrs.add(g.e.to); if (g.e.to === hov) hovNbrs.add(g.e.from); }
      const appear = appearRef.current;
      for (const id of V.nodes) if (!appear.has(id)) appear.set(id, now);
      for (const id of appear.keys()) if (!V.nodes.has(id)) appear.delete(id);
      const grow = (id: string) => reduced.current ? 1 : Math.max(0, Math.min(1, (now - (appear.get(id) ?? 0)) / 520));

      // ---- background: survey paper with a dot grid ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = th["--map"]; ctx.fillRect(0, 0, w, h);
      const gs = 48 * k;
      if (gs > 10) {
        ctx.fillStyle = th["--map-dot"];
        const ox = ((t.x % gs) + gs) % gs, oy = ((t.y % gs) + gs) % gs;
        const rr = Math.min(1.6, 0.6 + k * 0.4);
        for (let x = ox; x < w; x += gs) for (let y = oy; y < h; y += gs) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * t.x, dpr * t.y);

      // lanes
      const xMin = -t.x / k, xMax = (w - t.x) / k;
      snap.lanes.forEach((l, i) => {
        ctx.fillStyle = i % 2 ? th["--lane-b"] : th["--lane-a"];
        ctx.fillRect(xMin, l.y0, xMax - xMin, l.y1 - l.y0);
        ctx.strokeStyle = th["--line"]; ctx.lineWidth = 1 / k;
        ctx.beginPath(); ctx.moveTo(xMin, l.y1 + 15); ctx.lineTo(xMax, l.y1 + 15); ctx.stroke();
      });
      // hop guides
      ctx.strokeStyle = th["--line"]; ctx.lineWidth = 1 / k; ctx.setLineDash([2 / k, 7 / k]);
      for (const c of snap.columns) { ctx.beginPath(); ctx.moveTo(c.x, snap.lanes[0].y0); ctx.lineTo(c.x, snap.lanes.at(-1)!.y1); ctx.stroke(); }
      ctx.setLineDash([]);

      // ---- routes ----
      ctx.lineCap = "round";
      const recentWin = 40 * 60 * 1000;
      const tNow = v.time ?? Infinity;
      for (const g of V.edges) {
        const src = nodeById.get(g.e.from)!, tgt = nodeById.get(g.e.to)!;
        const onPath = PE.has(g.e.id);
        const touchesHover = hov && (g.e.from === hov || g.e.to === hov);
        const recent = v.time != null && tNow - g.t0 < recentWin;
        let a = 0.42;
        if (hasPath) a = onPath ? 1 : 0.06;
        else if (hov) a = touchesHover ? 0.95 : 0.08;
        else if (recent) a = 0.9;
        // a route draws itself once both of its stops have appeared
        const drawn = reduced.current ? 1 : easeOut(Math.max(0, Math.min(1, (now - Math.max(appear.get(g.e.from) ?? 0, appear.get(g.e.to) ?? 0)) / 750)));
        if (drawn <= 0) continue;
        let grad = gradRef.current.get(g.e.id);
        if (!grad) {
          grad = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
          const c0 = src.state === "source" ? th["--ink-2"] : th[STATE_VAR[src.state]] || th["--muted"];
          const c1 = th[STATE_VAR[tgt.state]] || th["--muted"];
          grad.addColorStop(0, c0); grad.addColorStop(1, c1);
          gradRef.current.set(g.e.id, grad);
        }
        ctx.globalAlpha = a;
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(g.w * (onPath ? 1.35 : 1), 1 / k);
        if (g.e.confidence === "reported") ctx.setLineDash([g.w * 1.2 + 6 / k, g.w + 6 / k]);
        else if (drawn < 1) ctx.setLineDash([g.len * 1.6 * drawn, g.len * 2]);
        ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.bezierCurveTo(g.c1x, g.c1y, g.c2x, g.c2y, g.x2, g.y2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;

      // ---- value in motion: glowing pulses with short tails ----
      if (!reduced.current) {
        if (th.dark) ctx.globalCompositeOperation = "lighter";
        for (const g of V.edges) {
          if (!g.e.usd || g.len * k < 28) continue;
          const onPath = PE.has(g.e.id);
          if (hasPath && !onPath) continue;
          if (hov && g.e.from !== hov && g.e.to !== hov) continue;
          const tgt = nodeById.get(g.e.to)!;
          const col = th[STATE_VAR[tgt.state]] || th["--muted"];
          const n = Math.max(1, Math.min(5, Math.round(Math.log10(g.e.usd) - 3.5)));
          const base = (now / 1000) * 110 / g.len;
          const rad = Math.max(1.6 / k, Math.min(g.w * 0.62, 7));
          for (let i = 0; i < n; i++) {
            const tt = (base + i / n + (g.t0 % 997) / 997) % 1;
            for (let j = 3; j >= 1; j--) {
              const p = bez(g, Math.max(0, tt - j * 0.018));
              ctx.fillStyle = withAlpha(col, 0.16 * (4 - j));
              ctx.beginPath(); ctx.arc(p.x, p.y, rad * (1 - j * 0.16), 0, Math.PI * 2); ctx.fill();
            }
            const p = bez(g, tt);
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
            if (rad * k > 2.4) { ctx.fillStyle = th.dark ? "rgba(255,255,255,.85)" : "#ffffff"; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 0.42, 0, Math.PI * 2); ctx.fill(); }
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // ---- stops ----
      const sel = v.selected;
      for (const n of snap.nodes) {
        if (!V.nodes.has(n.id)) continue;
        const gr = grow(n.id); if (gr <= 0) continue;
        const sc = reduced.current ? 1 : easeOutBack(gr);
        const col = th[STATE_VAR[n.state]] || th["--muted"];
        const dim = (hasPath && !pinned.has(n.id)) || (hov && hov !== n.id && !hovNbrs.has(n.id));
        ctx.globalAlpha = (dim ? 0.22 : 1) * Math.min(1, gr * 2);
        const r = Math.max(n.r, 2.4 / k) * sc;
        const big = n.r * k >= 9;
        const hollow = n.state === "service" || n.state === "related" || n.state === "unclassified";

        if (big && !hollow && !dim) { ctx.shadowColor = withAlpha(col, th.dark ? 0.75 : 0.45); ctx.shadowBlur = Math.min(28, n.r * k * 0.9); }
        ctx.beginPath();
        if (n.state === "source") ctx.roundRect(n.x - r, n.y - r, r * 2, r * 2, r * 0.32);
        else if (n.state === "infrastructure") { ctx.moveTo(n.x, n.y - r * 1.25); ctx.lineTo(n.x + r * 1.25, n.y); ctx.lineTo(n.x, n.y + r * 1.25); ctx.lineTo(n.x - r * 1.25, n.y); ctx.closePath(); }
        else ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (hollow) {
          ctx.fillStyle = th["--surface"]; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6 / k, r * 0.22); ctx.stroke();
        } else {
          ctx.fillStyle = col; ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = th["--map"]; ctx.lineWidth = 2 / k; ctx.stroke();
        }
        ctx.shadowBlur = 0;
        if (n.confidence === "reported" && !hollow) {
          ctx.setLineDash([3 / k, 3 / k]); ctx.lineWidth = 1.6 / k; ctx.strokeStyle = col;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 3 / k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
        // Binance's logo inside its drained wallets (identifies the victim; not site branding)
        if (n.state === "source" && r * k >= 7) {
          const im = img(BINANCE_LOGO);
          if (im) {
            ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(n.x - r * 0.8, n.y - r * 0.8, r * 1.6, r * 1.6, r * 0.3); ctx.fill();
            const s = r * 1.3; ctx.drawImage(im, n.x - s / 2, n.y - s / 2, s, s);
          }
        }
        // token glyph inside large stops
        if (n.r * k >= 15 && !hollow && n.state !== "source") {
          const im = img(tokenIconUrl(glyph.get(n.id) ?? "") ?? null);
          if (im) {
            ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.56, 0, Math.PI * 2); ctx.fill();
            const s = r * 0.82; ctx.drawImage(im, n.x - s / 2, n.y - s / 2, s, s);
          }
        }
        if (movedRef.current.has(n.id)) {
          const ph = (now / 1100) % 1;
          ctx.strokeStyle = withAlpha(th["--st-held"], 1 - ph); ctx.lineWidth = 2.5 / k;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 / k + ph * 16 / k, 0, Math.PI * 2); ctx.stroke();
        }
        if (sel === n.id || hov === n.id) {
          ctx.strokeStyle = th["--ink"]; ctx.lineWidth = 2.2 / k;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 / k, 0, Math.PI * 2); ctx.stroke();
          if (sel === n.id && !reduced.current) {
            const ph = (now / 1400) % 1;
            ctx.strokeStyle = withAlpha(th["--ink"], 0.5 * (1 - ph)); ctx.lineWidth = 1.5 / k;
            ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 / k + ph * 22 / k, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      // ---- screen-space overlays ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const placed: [number, number, number, number][] = [];
      const cand = snap.nodes.filter((n) => V.nodes.has(n.id) && grow(n.id) > 0.6 && (
        n.id === sel || pinned.has(n.id) || n.id === hov ||
        (n.r * k >= 6 && (n.label || n.heldUsd > 0)) || (k > 1.6 && n.r * k >= 3.5)
      ));
      cand.sort((a, b) => (b.id === sel ? 1 : 0) - (a.id === sel ? 1 : 0) || Math.max(b.heldUsd, b.inUsd) - Math.max(a.heldUsd, a.inUsd));
      for (const n of cand.slice(0, 140)) {
        const sx = n.x * k + t.x + n.r * k + 9, sy = n.y * k + t.y;
        if (sx < -200 || sx > w || sy < 0 || sy > h) continue;
        const title = nodeTitle(n);
        const t1 = title.length > 40 ? title.slice(0, 39) + "…" : title;
        const val = n.heldUsd > 0 ? `${usd(n.heldUsd)} held` : n.inUsd > 0 ? `${usd(n.inUsd)} received` : "";
        ctx.font = `600 13px ${th.display}`;
        const w1 = ctx.measureText(t1).width;
        ctx.font = `500 11px ${th.font}`;
        const w2 = val ? ctx.measureText(val).width + 14 : 0;
        const bw = Math.max(w1, w2) + 14, bh = val ? 36 : 22;
        const box: [number, number, number, number] = [sx - 5, sy - bh / 2, bw, bh];
        const hit = placed.some((p) => box[0] < p[0] + p[2] && box[0] + box[2] > p[0] && box[1] < p[1] + p[3] && box[1] + box[3] > p[1]);
        if (hit && n.id !== sel && !pinned.has(n.id)) continue;
        placed.push(box);
        ctx.fillStyle = withAlpha(th["--surface"], 0.92);
        ctx.shadowColor = "rgba(0,0,0,.12)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.roundRect(box[0], box[1], box[2], box[3], 7); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.fillStyle = th["--ink"]; ctx.font = `600 13px ${th.display}`; ctx.textBaseline = "middle";
        ctx.fillText(t1, sx + 2, val ? sy - 7 : sy);
        if (val) {
          ctx.fillStyle = th[STATE_VAR[n.state]] || th["--muted"]; ctx.beginPath(); ctx.arc(sx + 6, sy + 9, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = th["--ink-2"]; ctx.font = `500 11px ${th.font}`; ctx.fillText(val, sx + 14, sy + 9.5);
        }
      }

      // lane chips pinned left, with chain logos. A chip sticks below the hop headers while its lane
      // is scrolled past, and chips that would overlap the one above are skipped.
      const compactChip = w < 640;
      let lastChipY = -Infinity;
      for (const l of snap.lanes) {
        const y0 = l.y0 * k + t.y, y1 = l.y1 * k + t.y;
        if (y1 < 40 || y0 > h) continue;
        const y = Math.min(Math.max(y0 + 20, 58), y1 - 20);
        if (y - lastChipY < (compactChip ? 30 : 44)) continue;
        lastChipY = y;
        const meta = snap.chains.find((c) => c.chain === l.chain);
        const name = CHAIN_NAME[l.chain];
        const transfers = meta?.traced === "edges" ? `${meta.edges} transfers traced` : meta?.traced === "single-hop" ? "first hop traced" : "transfers reported";
        const sub = meta?.balances === "on-chain" ? (meta.traced === "edges" ? transfers : `Balance on-chain, ${transfers}`) : "Reported figures only";
        ctx.font = `600 ${compactChip ? 12 : 14}px ${th.display}`;
        const bw = compactChip ? ctx.measureText(name).width + 38 : Math.max(ctx.measureText(name).width, ctx.measureText(sub).width * 0.8) + 50;
        const bh = compactChip ? 26 : 40;
        ctx.fillStyle = withAlpha(th["--surface"], 0.95);
        ctx.shadowColor = "rgba(0,0,0,.10)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.roundRect(8, y - bh / 2 + (compactChip ? 0 : 3), bw, bh, compactChip ? 13 : 10); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        const ic = img(`/icons/chains/${l.chain}.svg`);
        const isz = compactChip ? 16 : 22;
        if (ic) ctx.drawImage(ic, 15, y - isz / 2 + (compactChip ? 0 : 3), isz, isz);
        ctx.fillStyle = th["--ink"]; ctx.textBaseline = "middle";
        if (compactChip) { ctx.fillText(name, 36, y + 0.5); continue; }
        ctx.fillText(name, 45, y - 4);
        ctx.fillStyle = th["--muted"]; ctx.font = `11px ${th.font}`; ctx.fillText(sub, 45, y + 11);
      }
      // hop headers pinned top; shorter labels when the columns are close together on screen
      ctx.font = `600 12px ${th.display}`;
      const colGap = (snap.columns[1]?.x ?? 300) - snap.columns[0].x;
      const gapPx = colGap * k;
      const chipRight = w < 640 ? 110 : 200;
      for (const c of snap.columns) {
        const sx = c.x * k + t.x;
        if (sx < chipRight || sx > w - 20) continue;
        const label = gapPx >= 130 ? c.label : gapPx >= 70 ? (c.depth === 0 ? "Start" : `Hop ${c.depth}`) : gapPx >= 30 ? (c.depth === 0 ? "S" : String(c.depth)) : null;
        if (!label) break;
        const tw = ctx.measureText(label).width + 18;
        ctx.fillStyle = c.depth === 0 ? th["--ink"] : withAlpha(th["--surface"], 0.95);
        ctx.beginPath(); ctx.roundRect(sx - tw / 2, 10, tw, 22, 11); ctx.fill();
        if (c.depth !== 0) { ctx.strokeStyle = th["--line-2"]; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.fillStyle = c.depth === 0 ? th["--surface"] : th["--ink-2"]; ctx.textBaseline = "middle"; ctx.textAlign = "center";
        ctx.fillText(label, sx, 21.5); ctx.textAlign = "left";
      }
    };
    raf = requestAnimationFrame(draw);

    // initial view: the visible wallets of the three traced chains, left aligned past the lane chips
    setTimeout(() => {
      const { w, h } = sizeRef.current;
      const shown = snap.nodes.filter((n) => visRef.current.nodes.has(n.id) && (n.chain === "eth" || n.chain === "tron" || n.chain === "btc"));
      const left = w < 640 ? 100 : 200;
      const x0 = Math.min(...shown.map((n) => n.x - n.r)) - 20, x1 = Math.max(...shown.map((n) => n.x + n.r)) + 160;
      const y0 = Math.min(...shown.map((n) => n.y - n.r)) - 40, y1 = Math.max(...shown.map((n) => n.y + n.r)) + 30;
      const k = Math.max(0.12, Math.min((w - left - 20) / (x1 - x0), (h - 60) / (y1 - y0), 1.2));
      z.transform(select(canvas), zoomIdentity.translate(left - x0 * k, 44 - y0 * k).scale(k));
    }, 30);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); mq.removeEventListener("change", onTheme); select(canvas).on(".zoom", null); };
  }, [snap, nodeById, glyph]);

  // ---------- focus / fit reactions ----------
  useEffect(() => {
    if (!view.selected || view.focusNonce === 0) return;
    const n = nodeById.get(view.selected);
    if (!n) return;
    const { w: fullW, h } = sizeRef.current;
    const w = drawerInset(fullW, n.id);
    const k = Math.max(1.1, Math.min(2.4, 60 / Math.max(n.r, 6)));
    animateTo(zoomIdentity.translate(w / 2 - n.x * k, h / 2 - n.y * k).scale(k), 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.focusNonce]);

  useEffect(() => {
    if (view.fitNonce === 0) return;
    if (view.highlight.length) fitRef.current(view.highlight);
    else fitRef.current([...visRef.current.nodes], 40, 1);
  }, [view.fitNonce, view.highlight]);

  // ---------- pointer ----------
  const pick = (cx: number, cy: number): SNode | null => {
    const t = tRef.current;
    const x = (cx - t.x) / t.k, y = (cy - t.y) / t.k;
    let best: SNode | null = null, bd = Infinity;
    for (const n of snap.nodes) {
      if (!visRef.current.nodes.has(n.id)) continue;
      const d = Math.hypot(n.x - x, n.y - y) - Math.max(n.r, 2.4 / t.k);
      if (d < 6 / t.k && d < bd) { bd = d; best = n; }
    }
    return best;
  };

  const onMove = (ev: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const n = pick(ev.clientX - r.left, ev.clientY - r.top);
    hoverRef.current = n?.id ?? null;
    canvasRef.current!.style.cursor = n ? "pointer" : "grab";
    setHover(n ? { id: n.id, x: ev.clientX - r.left, y: ev.clientY - r.top } : null);
  };
  const onClick = (ev: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const n = pick(ev.clientX - r.left, ev.clientY - r.top);
    dispatch({ type: "select", node_id: n?.id ?? null });
  };

  const zoomBy = (f: number) => {
    const { w, h } = sizeRef.current, t = tRef.current;
    const k = Math.max(0.04, Math.min(10, t.k * f));
    animateTo(zoomIdentity.translate(w / 2 - ((w / 2 - t.x) / t.k) * k, h / 2 - ((h / 2 - t.y) / t.k) * k).scale(k), 320);
  };

  const hn = hover ? nodeById.get(hover.id) : null;
  const hAsset = hn ? glyph.get(hn.id) : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-map" aria-label="Flow map of stolen funds. Use the Addresses view for an accessible list.">
      <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => { hoverRef.current = null; setHover(null); }} onClick={onClick} className="block touch-none" />

      {hn && hover && (
        <div key={hn.id} className="pop-in pointer-events-none absolute z-10 w-72 rounded-xl border border-line bg-raised p-3 text-xs shadow-float"
          style={{ left: Math.min(hover.x + 16, sizeRef.current.w - 300), top: Math.min(hover.y + 16, sizeRef.current.h - 150) }}>
          <div className="flex items-start gap-2.5">
            <div className="relative mt-0.5">
              {isBinanceWallet(hn) ? <BinanceLogo size={28} /> : hAsset ? <TokenIcon symbol={hAsset} size={28} /> : <ChainIcon chain={hn.chain as Chain} size={28} />}
              <span className="absolute -bottom-1 -right-1 rounded-full bg-raised p-px"><ChainIcon chain={hn.chain as Chain} size={13} /></span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="display truncate text-[14px] font-semibold leading-tight text-ink">{nodeTitle(hn)}</div>
              <div className="mono mt-0.5 truncate text-[11px] text-muted">{short(hn.address, 8)}</div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5"><StateBadge state={hn.state} />{hn.confidence === "reported" && <span className="rounded-full px-2 py-0.5 text-[11px] text-ink-2 ring-1 ring-line-2">Reported</span>}</div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface-2 px-2 py-1.5"><div className="text-[10.5px] text-muted">Holds now</div><div className="num display text-[15px] font-semibold text-ink">{hn.heldUsd ? usd(hn.heldUsd) : "—"}</div></div>
            <div className="rounded-lg bg-surface-2 px-2 py-1.5"><div className="text-[10.5px] text-muted">Received</div><div className="num display text-[15px] font-semibold text-ink">{hn.inUsd ? usd(hn.inUsd) : "—"}</div></div>
          </div>
          {hn.holdings[0] && <div className="num mt-2 text-ink-2">{hn.holdings.slice(0, 2).map((h) => compactAmt(h.amount, h.asset)).join(" and ")}</div>}
          {hn.firstSeen && <div className="mt-1 text-muted">First seen {utc(hn.firstSeen)}</div>}
          {movedRef.current.has(hn.id) && <div className="mt-2 rounded-md px-2 py-1 font-medium" style={{ color: "var(--st-held)", background: "color-mix(in oklab, var(--st-held) 12%, transparent)" }}>Balance changed since the snapshot</div>}
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col items-center overflow-hidden rounded-xl border border-line bg-raised shadow-card">
        <button onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in" className="press grid h-9 w-9 place-items-center text-ink-2 hover:bg-surface-2 hover:text-ink"><Plus size={16} /></button>
        <div className="num display w-9 border-y border-line py-1 text-center text-[10.5px] text-muted">{zoomPct}%</div>
        <button onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" title="Zoom out" className="press grid h-9 w-9 place-items-center text-ink-2 hover:bg-surface-2 hover:text-ink"><Minus size={16} /></button>
        <button onClick={() => dispatch({ type: "reset_view" })} aria-label="Fit everything and reset" title="Fit everything and reset" className="press grid h-9 w-9 place-items-center border-t border-line text-ink-2 hover:bg-surface-2 hover:text-ink"><Scan size={15} /></button>
      </div>
    </div>
  );
}
