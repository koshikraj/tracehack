/* eslint-disable @next/next/no-img-element */
import manifest from "../../public/icons/manifest.json";
import type { Chain } from "@/lib/types";
import { CHAIN_NAME } from "@/lib/format";

const SOURCES = manifest.sources as Record<string, string>;
const TOKENS = new Set(manifest.tokens);

/** Name or URL fragment → domain that has a logo. */
const NAME_TO_DOMAIN: [RegExp, string][] = [
  [/trm/i, "trmlabs.com"], [/bitquery/i, "bitquery.io"], [/arkham/i, "arkhamintelligence.com"],
  [/chainalysis/i, "chainalysis.com"], [/elliptic/i, "elliptic.co"], [/peckshield/i, "peckshield.com"],
  [/lookonchain/i, "lookonchain.com"], [/misttrack/i, "misttrack.io"], [/tether/i, "tether.to"],
  [/circle/i, "circle.com"], [/ripple/i, "ripple.com"], [/world liberty|wlfi/i, "worldlibertyfinancial.com"],
  [/aave/i, "aave.com"], [/arbitrum/i, "arbitrum.io"], [/bitget/i, "bitget.com"], [/paxos/i, "paxos.com"],
  [/cnbc/i, "cnbc.com"], [/techcrunch/i, "techcrunch.com"], [/\bap\b|apnews/i, "apnews.com"],
  [/coindesk/i, "coindesk.com"], [/bbc/i, "bbc.com"], [/dev\.to/i, "dev.to"], [/cryptoticker/i, "cryptoticker.io"],
  [/bugcrowd/i, "bugcrowd.com"], [/coinbase/i, "coinbase.com"], [/blockscout/i, "blockscout.com"],
  [/mempool/i, "mempool.space"], [/trongrid|tronscan/i, "tronscan.org"], [/xrpl/i, "xrpl.org"], [/etherscan|public rpc/i, "etherscan.io"],
  [/binance/i, "binance.com"],
];

export function domainFor(urlOrName: string | null | undefined): string | null {
  if (!urlOrName) return null;
  try {
    const u = new URL(urlOrName);
    const host = u.hostname.replace(/^www\./, "");
    if (SOURCES[host]) return host;
    if (host === "x.com" || host === "twitter.com") return domainFor(u.pathname.split("/")[1] ?? "");
    const parent = host.split(".").slice(-2).join(".");
    if (SOURCES[parent]) return parent;
  } catch { /* not a URL: match by name */ }
  for (const [re, d] of NAME_TO_DOMAIN) if (re.test(urlOrName) && SOURCES[d]) return d;
  return null;
}

const MONO_TONES = ["#2563eb", "#0ea47a", "#7048e8", "#e0409a", "#0f766e", "#4a4f5c"];

export function Monogram({ name, size = 20 }: { name: string; size?: number }) {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, "").trim() || "?";
  const letters = clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  let h = 0; for (const c of clean) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className="display inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: MONO_TONES[h % MONO_TONES.length] }}>{letters}</span>
  );
}

/** Logo for a source / firm, or a monogram. */
export function SourceLogo({ source, name, size = 18 }: { source: string | null | undefined; name?: string; size?: number }) {
  const d = domainFor(source) ?? domainFor(name);
  if (d && SOURCES[d]) {
    return <img src={SOURCES[d]} alt="" width={size} height={size} loading="lazy"
      className="shrink-0 rounded-[5px] bg-white object-contain ring-1 ring-line" style={{ width: size, height: size }} />;
  }
  return <Monogram name={name ?? source ?? "?"} size={size} />;
}

export function ChainIcon({ chain, size = 16, title }: { chain: Chain; size?: number; title?: boolean }) {
  return <img src={`/icons/chains/${chain}.svg`} alt={title ? CHAIN_NAME[chain] : ""} width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
}

export function TokenIcon({ symbol, size = 16 }: { symbol: string; size?: number }) {
  const s = symbol.replace(/^A(?=USDT$)/, "").replace(" debt", "").replace(/^variableDebtEth/, "").replace(/^USDt$/, "USDT").replace(/^USDT0$/, "USDT").replace(/^WETH$/, "ETH");
  if (TOKENS.has(s)) return <img src={`/icons/tokens/${s}.svg`} alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="display inline-grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-ink-2 ring-1 ring-line"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{s.slice(0, 3)}</span>
  );
}

export const tokenIconUrl = (symbol: string) => {
  const s = symbol === "AUSDT" || symbol === "USDt" || symbol === "USDT0" ? "USDT" : symbol === "WETH debt" ? "ETH" : symbol;
  return TOKENS.has(s) ? `/icons/tokens/${s}.svg` : null;
};

export const ICON_CREDITS = manifest.credits;

/** Binance's logo, used only to identify Binance's own wallets, posts and sources (never as site branding). */
export const BINANCE_LOGO = "/icons/apps/binance.svg";
export function BinanceLogo({ size = 16, title = true }: { size?: number; title?: boolean }) {
  return <img src={BINANCE_LOGO} alt={title ? "Binance" : ""} width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
}
/** Drained wallets are all Binance's (the victim of this hack). */
export const isBinanceWallet = (n: { state: string }) => n.state === "source";

/** A post author's public profile picture with a verified tick; falls back to logo / monogram. */
export function PostAvatar({ post, size = 36, ring }: { post: { avatar: string | null; name: string; domain: string | null; verified?: boolean }; size?: number; ring?: boolean }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {post.avatar
        ? <img src={post.avatar} alt="" width={size} height={size} loading="lazy" className={`h-full w-full rounded-full object-cover ${ring ? "ring-2 ring-surface" : "ring-1 ring-line"}`} />
        : <SourceLogo source={post.domain ? `https://${post.domain}` : null} name={post.name} size={size} />}
      {post.verified && size >= 28 && (
        <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full ring-2 ring-raised" style={{ width: size * 0.38, height: size * 0.38, background: "var(--st-frozen)" }} aria-label="Verified account">
          <svg viewBox="0 0 12 12" width={size * 0.24} height={size * 0.24} aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      )}
    </span>
  );
}
