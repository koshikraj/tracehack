"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Confidence, FundState, NodeState } from "@/lib/types";
import { CONF_LABEL, STATE_LABEL, STATE_VAR, usd } from "@/lib/format";

export function StateDot({ state, size = 10 }: { state: NodeState | FundState; size?: number }) {
  const ring = state === "service" || state === "related" || state === "unclassified";
  return (
    <span className="dot" aria-hidden
      style={{
        width: size, height: size,
        background: ring ? "var(--surface)" : `var(${STATE_VAR[state]})`,
        boxShadow: ring ? `inset 0 0 0 ${Math.max(2, size / 4)}px var(${STATE_VAR[state]})` : `0 0 0 ${size > 9 ? 2 : 1.5}px color-mix(in oklab, var(${STATE_VAR[state]}) 22%, transparent)`,
        borderRadius: state === "source" ? 3 : 999,
      }} />
  );
}

export function StateBadge({ state }: { state: NodeState | FundState }) {
  const c = `var(${STATE_VAR[state]})`;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ background: `color-mix(in oklab, ${c} 13%, transparent)`, color: `color-mix(in oklab, ${c} 75%, var(--ink))` }}>
      <StateDot state={state} size={7} />{STATE_LABEL[state]}
    </span>
  );
}

const CONF_ICON: Record<Confidence, string> = { "verified-onchain": "✓", "traced-onchain": "↝", reported: "❝", unverified: "?" };

export function ConfBadge({ c, compact }: { c: Confidence; compact?: boolean }) {
  const strong = c === "verified-onchain";
  return (
    <span title={CONF_LABEL[c]}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${strong ? "bg-ink text-surface"
        : c === "traced-onchain" ? "bg-surface-2 text-ink-2 ring-1 ring-line" : "text-ink-2 ring-1 ring-dashed ring-line-2"}`}
      style={c === "reported" || c === "unverified" ? { outline: "1px dashed var(--line-2)", outlineOffset: -1 } : undefined}>
      <span aria-hidden>{CONF_ICON[c]}</span>{compact ? null : CONF_LABEL[c]}
    </span>
  );
}

export function Section({ title, hint, children, right }: { title: string; hint?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="px-4 py-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="display text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {right}
      </div>
      {hint && <p className="mb-3 text-[12px] leading-snug text-muted">{hint}</p>}
      {children}
    </section>
  );
}

export function ExtLink({ href, children, className = "" }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={`underline decoration-line-2 underline-offset-2 transition-colors hover:decoration-current ${className}`}>{children}</a>;
}

/** Tweens a USD figure when it changes (user filters, first load). Respects reduced motion. */
export function CountUsd({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    const start = performance.now(), a = from.current, dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - p, 4);
      setShown(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`num ${className ?? ""}`}>{usd(shown)}</span>;
}

export function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`press grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
      {children}
    </button>
  );
}
