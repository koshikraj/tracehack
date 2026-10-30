/**
 * Writes public/icons/: chain + token SVGs from @web3icons/core (MIT) and source/firm favicons
 * (fetched once via DuckDuckGo's favicon service; marks belong to their owners and are used only to
 * identify the source). Binance's logo only identifies Binance's own wallets, posts and sources.
 * Run: npm run icons
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../public/icons");
const W3 = path.resolve(here, "../node_modules/@web3icons/core/dist/svgs");

const CHAINS: Record<string, string> = {
  eth: "ethereum", tron: "tron", btc: "bitcoin", xrp: "xrp", sol: "solana",
  arb: "arbitrum-one", avalanche: "avalanche", polygon: "polygon",
};
const TOKENS = ["ETH", "BTC", "TRX", "XRP", "SOL", "ARB", "AVAX", "POL", "USDT", "USDC", "PAXG", "XAUT", "FDUSD",
  "WBETH", "AAVE", "UNI", "PEPE", "LINK", "USDE", "USDD", "RUNE", "CRV", "CAKE"];
const APPS: Record<string, string> = { binance: "binance", uniswap: "uniswap", pancakeswap: "pancake-swap", bitget: "bitget", "1inch": "1inch" };

// Source / firm domains shown next to figures, posts and links.
export const SOURCE_DOMAINS = [
  "binance.com", "trmlabs.com", "bitquery.io", "arkhamintelligence.com", "chainalysis.com", "elliptic.co", "peckshield.com",
  "lookonchain.com", "blockaid.io", "misttrack.io", "tether.to", "circle.com", "ripple.com",
  "worldlibertyfinancial.com", "aave.com", "arbitrum.io", "bitget.com", "paxos.com",
  "cnbc.com", "techcrunch.com", "apnews.com", "coindesk.com", "bbc.com", "dev.to", "808bits.com",
  "cryptoticker.io", "bugcrowd.com", "coinbase.com", "etherscan.io", "tronscan.org", "mempool.space",
  "solscan.io", "arbiscan.io", "snowtrace.io", "polygonscan.com", "xrpl.org", "blockscout.com",
];

async function svgFrom(file: string): Promise<string | null> {
  if (!fs.existsSync(file)) return null;
  const mod = await import(pathToFileURL(file).href);
  const v = mod.default ?? Object.values(mod)[0];
  return typeof v === "string" ? v : null;
}

async function main() {
  for (const d of ["chains", "tokens", "apps", "sources"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const manifest: { chains: string[]; tokens: string[]; apps: string[]; sources: Record<string, string>; credits: string } = {
    chains: [], tokens: [], apps: [], sources: {},
    credits: "Chain, token and app icons: @web3icons/core (MIT). Source logos: site favicons, trademarks of their owners, used only to identify the source.",
  };
  for (const [c, name] of Object.entries(CHAINS)) {
    const svg = await svgFrom(path.join(W3, "networks/branded", `${name}.svg.js`));
    if (svg) { fs.writeFileSync(path.join(OUT, "chains", `${c}.svg`), svg); manifest.chains.push(c); }
  }
  for (const t of TOKENS) {
    const svg = await svgFrom(path.join(W3, "tokens/branded", `${t}.svg.js`));
    if (svg) { fs.writeFileSync(path.join(OUT, "tokens", `${t}.svg`), svg); manifest.tokens.push(t); }
  }
  for (const [k, name] of Object.entries(APPS)) {
    const svg = await svgFrom(path.join(W3, "exchanges/branded", `${name}.svg.js`));
    if (svg) { fs.writeFileSync(path.join(OUT, "apps", `${k}.svg`), svg); manifest.apps.push(k); }
  }
  for (const d of SOURCE_DOMAINS) {
    try {
      const r = await fetch(`https://icons.duckduckgo.com/ip3/${d}.ico`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || buf.length < 100) throw new Error(`HTTP ${r.status}, ${buf.length} bytes`);
      const ext = buf.subarray(0, 4).toString("hex") === "89504e47" ? "png" : "ico";
      fs.writeFileSync(path.join(OUT, "sources", `${d}.${ext}`), buf);
      manifest.sources[d] = `/icons/sources/${d}.${ext}`;
    } catch (e) {
      console.warn(`  skip ${d}: ${(e as Error).message}`);
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`icons: ${manifest.chains.length} chains, ${manifest.tokens.length} tokens, ${manifest.apps.length} apps, ${Object.keys(manifest.sources).length} sources`);
}
main();
