import { useId } from "react";

/**
 * Hop, the assistant's mascot: a round glossy head with a visor face, an antenna node on top and
 * station-ring "ears". Colours come from --hop-* tokens in globals.css so it follows the light/dark
 * theme; `onInk` uses the dark-theme tokens for when Hop sits on an ink-coloured button.
 * At 28 px and below it switches to a simplified glyph (tighter crop, flat fills, bolder features).
 */
export type HopMood = "happy" | "neutral" | "sad" | "thinking" | "found" | "surprised";
export const HOP_MOODS: HopMood[] = ["happy", "neutral", "sad", "thinking", "found", "surprised"];

/** Eyes (l, r), mouth (m) and optional brows (bl, br), all drawn as round-capped strokes on the visor. */
type Face = { l: string; r: string; m: string; bl?: string; br?: string; blush?: boolean };
const dot = (x: number, y: number, rr: number) => `M${x - rr} ${y} a${rr} ${rr} 0 1 0 ${rr * 2} 0 a${rr} ${rr} 0 1 0 ${-rr * 2} 0`;

const FACES: Record<HopMood, Face> = {
  happy: { l: "M74 110 Q82 98 90 110", r: "M110 110 Q118 98 126 110", m: "M88 126 Q100 137 112 126", blush: true },
  neutral: { l: "M81 108 L83 108", r: "M117 108 L119 108", m: "M92 129 L108 129" },
  sad: {
    l: "M81 112 L83 112", r: "M117 112 L119 112", m: "M88 134 Q100 123 112 134",
    bl: "M70 100 Q78 92 90 94", br: "M110 94 Q122 92 130 100",
  },
  thinking: {
    l: "M85 104 L87 104", r: "M121 104 L123 104", m: "M92 130 Q100 127 108 128",
    bl: "M74 96 L90 96", br: "M112 90 Q120 84 130 90",
  },
  found: { l: dot(82, 107, 6), r: dot(118, 107, 6), m: "M86 122 Q100 142 114 122 Z", blush: true },
  surprised: { l: dot(82, 106, 7), r: dot(118, 106, 7), m: dot(100, 131, 5), bl: "M72 90 Q82 84 92 88", br: "M108 88 Q118 84 128 90" },
};
const MOOD_WORD: Record<HopMood, string> = {
  happy: "happy", neutral: "ready", sad: "sad", thinking: "thinking", found: "found it", surprised: "surprised",
};

export default function Hop({ mood = "happy", size = 40, decorative = false, onInk = false, animated = true, className = "" }: {
  mood?: HopMood; size?: number; decorative?: boolean; onInk?: boolean;
  /** idle float, blinking and per-mood motion (CSS in globals.css; off for prefers-reduced-motion) */
  animated?: boolean; className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `hop${n}${uid}`;
  const compact = size <= 28;
  const f = FACES[mood];
  const featureWidth = compact ? 11 : 6;

  return (
    <svg viewBox={compact ? "22 30 156 156" : "0 0 200 200"} width={size} height={size}
      className={`hop hop-${mood} ${compact ? "hop-compact" : ""} ${animated ? "" : "hop-still"} ${onInk ? "hop-on-ink" : ""} shrink-0 ${className}`} style={{ overflow: "visible" }}
      role={decorative ? "presentation" : "img"} aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Hop, the Trace the Hack assistant, ${MOOD_WORD[mood]}`}>
      <defs>
        <radialGradient id={id("Visor")} cx="40%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#33457a" />
          <stop offset="55%" stopColor="#18223f" />
          <stop offset="100%" stopColor="#080b16" />
        </radialGradient>
        <linearGradient id={id("Shell")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--hop-hood-top)" }} />
          <stop offset="100%" style={{ stopColor: "var(--hop-hood-bottom)" }} />
        </linearGradient>
        <filter id={id("Glow")} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {!compact && <ellipse cx="100" cy="190" rx="50" ry="6" className="hop-shadow" style={{ fill: "var(--hop-shadow)" }} />}

      <g className="hop-body">
        {!compact && (
          <>
            <line x1="100" y1="34" x2="108" y2="13" strokeWidth="4" strokeLinecap="round" style={{ stroke: "var(--hop-edge)" }} />
            <circle cx="109" cy="11" r="6.5" fill="#e8eeff" strokeWidth="2" className="hop-node" filter={`url(#${id("Glow")})`} style={{ stroke: "var(--hop-edge)" }} />
            {/* station-ring ears */}
            <path d="M26 110 L 18 110" strokeWidth="4" strokeLinecap="round" style={{ stroke: "var(--hop-edge)" }} />
            <path d="M174 110 L 182 110" strokeWidth="4" strokeLinecap="round" style={{ stroke: "var(--hop-edge)" }} />
            <circle cx="15" cy="110" r="6" fill="#ffffff" strokeWidth="2.5" style={{ stroke: "var(--hop-edge)" }} />
            <circle cx="185" cy="110" r="6" fill="#ffffff" strokeWidth="2.5" style={{ stroke: "var(--hop-edge)" }} />
          </>
        )}

        {/* round head */}
        <circle cx="100" cy="110" r="76" strokeWidth={compact ? 6 : 2.5}
          style={{ fill: compact ? "var(--hop-hood-flat)" : `url(#${id("Shell")})`, stroke: "var(--hop-edge)" }} />
        {!compact && <path d="M44 78 Q60 46 98 38" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" opacity="0.18" />}

        {/* visor face */}
        <ellipse cx="100" cy="114" rx={compact ? 64 : 60} ry={compact ? 54 : 50} fill={compact ? "#2b3a63" : `url(#${id("Visor")})`} />
        {!compact && <path d="M58 92 Q66 76 84 70" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" opacity="0.32" />}

        {/* keyed by mood so the face pops whenever the expression changes */}
        <g key={mood} className="hop-face">
          {f.blush && !compact && (
            <>
              <ellipse cx="70" cy="124" rx="8" ry="5" fill="#ffffff" opacity="0.16" />
              <ellipse cx="130" cy="124" rx="8" ry="5" fill="#ffffff" opacity="0.16" />
            </>
          )}
          <g fill="none" stroke="#dbe6ff" strokeWidth={featureWidth} strokeLinecap="round" strokeLinejoin="round"
            filter={compact ? undefined : `url(#${id("Glow")})`}>
            <g className="hop-eyes">
              <path d={f.l} />
              <path d={f.r} />
            </g>
            {f.bl && <path d={f.bl} strokeWidth={compact ? 8 : 4} />}
            {f.br && <path d={f.br} strokeWidth={compact ? 8 : 4} />}
            <path d={f.m} strokeWidth={compact ? 8 : 4} fill={mood === "found" ? "rgba(219,230,255,0.25)" : "none"} />
          </g>
          {mood === "sad" && !compact && (
            <path d="M84 120 Q80 128 84 132 Q88 128 84 120 Z" fill="#9cc0ff" opacity="0.9" className="hop-tear" />
          )}
        </g>

        {mood === "thinking" && !compact && (
          <g className="hop-think" style={{ fill: "var(--hop-accent)" }}>
            <circle cx="160" cy="40" r="5" />
            <circle cx="174" cy="26" r="7" opacity="0.75" />
            <circle cx="192" cy="10" r="9" opacity="0.5" />
          </g>
        )}
        {mood === "found" && !compact && (
          <g style={{ fill: "var(--hop-accent)" }}>
            <path className="hop-sparkle" d="M164 46 L 168 36 L 172 46 L 182 50 L 172 54 L 168 64 L 164 54 L 154 50 Z" />
            <path className="hop-sparkle hop-sparkle-2" d="M182 22 L 184 17 L 186 22 L 191 24 L 186 26 L 184 31 L 182 26 L 177 24 Z" opacity="0.6" />
          </g>
        )}
        {mood === "surprised" && (
          <g className="hop-badge">
            <circle cx="168" cy="44" r="12" style={{ fill: "var(--hop-accent)" }} />
            <path d="M168 37 L 168 46" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: "var(--hop-on-accent)" }} />
            <circle cx="168" cy="51" r="2" style={{ fill: "var(--hop-on-accent)" }} />
          </g>
        )}
      </g>
    </svg>
  );
}
