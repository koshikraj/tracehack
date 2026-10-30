// X accounts whose posts appear on the site: organisations, cited investigators and public figures.
// Random, anonymous-small and private accounts in tweets.json are left out on purpose.
// `avatar: false` would hide an account's picture; none is hidden now (Binance's logo identifies Binance, rule changed 30 Oct 2026).
import type { Post } from "../src/lib/types";

export type Account = Pick<Post, "name" | "kind" | "domain"> & { role?: string; avatar?: false };

export const POST_ACCOUNTS: Record<string, Account> = {
  // official / organisations
  binance: { name: "Binance", kind: "official", domain: "binance.com", role: "Official exchange account" },
  Ripple: { name: "Ripple", kind: "issuer", domain: "ripple.com" },
  worldlibertyfi: { name: "World Liberty Financial", kind: "issuer", domain: "worldlibertyfinancial.com" },
  aave: { name: "Aave", kind: "protocol", domain: "aave.com" },
  arbitrum: { name: "Arbitrum", kind: "protocol", domain: "arbitrum.io" },
  bitget: { name: "Bitget", kind: "protocol", domain: "bitget.com" },
  // analytics firms
  arkham: { name: "Arkham", kind: "firm", domain: "arkhamintelligence.com" },
  chainalysis: { name: "Chainalysis", kind: "firm", domain: "chainalysis.com" },
  elliptic: { name: "Elliptic", kind: "firm", domain: "elliptic.co" },
  PeckShieldAlert: { name: "PeckShield", kind: "firm", domain: "peckshield.com" },
  blockaid_: { name: "Blockaid", kind: "firm", domain: null },
  MistTrack_io: { name: "MistTrack", kind: "firm", domain: "misttrack.io" },
  // investigators and news
  lookonchain: { name: "Lookonchain", kind: "investigator", domain: "lookonchain.com" },
  zachxbt: { name: "ZachXBT", kind: "investigator", domain: null, role: "On-chain investigator" },
  officer_secret: { name: "Officer's Notes", kind: "investigator", domain: null, role: "On-chain researcher" },
  EmberCN: { name: "EmberCN", kind: "investigator", domain: null, role: "On-chain analyst" },
  emmettgallic: { name: "Emmett Gallic", kind: "investigator", domain: null, role: "Blockchain investigator" },
  justinkalland: { name: "Justin Kalland", kind: "investigator", domain: null, role: "On-chain researcher" },
  WuBlockchain: { name: "Wu Blockchain", kind: "news", domain: null, role: "Crypto news" },
  // public figures
  cz_binance: { name: "Changpeng Zhao", kind: "person", domain: null, role: "Binance co-founder" },
  heyibinance: { name: "Yi He", kind: "person", domain: null, role: "Binance co-founder" },
  _RichardTeng: { name: "Richard Teng", kind: "person", domain: null, role: "Binance CEO" },
  paoloardoino: { name: "Paolo Ardoino", kind: "person", domain: null, role: "Tether CEO" },
  jerallaire: { name: "Jeremy Allaire", kind: "person", domain: null, role: "Circle CEO" },
  StaniKulechov: { name: "Stani Kulechov", kind: "person", domain: null, role: "Aave founder" },
};

/** Posts from the accounts above that are left out, each with the reason (shown on the Sources page). */
export const EXCLUDED_POSTS: Record<string, string> = {
  "2115943857397653741": "Reply with only an emoji",
  "2115977536501121061": "Reply with only an emoji",
  "2115981245557743772": "Reply with only an emoji",
  "2115982763690226093": "Reply with only an emoji",
  "2115917332786851967": "No content captured beyond \"Confirmed hack:\"",
  "2115962151546593722": "Reply banter aimed at another user, no information about the funds",
  "2115962607534477804": "General comment, no information about the funds",
  "2115974434129584194": "Reply question, no information about the funds",
  "2116031771867488328": "About the attacker group's general laundering habits, not this hack's funds",
  "2116034642960904248": "Typo correction",
  "2115970230908543179": "Off-topic reply",
  "2115976524352586214": "About a third-party trader betting on the news, not the stolen funds",
  "2115981650735911418": "About a third-party trader betting on the news, not the stolen funds",
  "2115983260744564794": "Customer-service reply to one user",
  "2115993361517891592": "Duplicate of the root-cause post a minute earlier",
  "2115971120340111618": "Link-only duplicate (\"Track the Binance Hacker on Arkham\")",
  "2116022348902195254": "Link-only duplicate (\"Track the Binance Hacker on Arkham\")",
  "2116038586374267247": "Link-only duplicate (\"Track the Binance Hacker on Arkham\")",
  "2116039768245186569": "Near-duplicate of the post two minutes earlier",
};

/** General rule on top of the list: no words left after removing @mentions, links and emoji, or a bare thank-you. */
export function isContentFree(text: string, hasMedia: boolean): boolean {
  const words = text.replace(/@\w+/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}$.%'\s]/gu, " ").trim().split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  if (words.length === 0) return true;
  return !hasMedia && words.length <= 3 && /^(thank you|thanks|life saver|ty)$/i.test(words.join(" ").replace(/[.!]/g, ""));
}

/** Sources in sources_curated.csv that are not about this hack, with the reason. */
export const OFF_TOPIC_SOURCES: Record<string, string> = {
  "https://bugcrowd.com/engagements/binance": "Binance's general bug bounty programme, not specific to this hack (the dataset only notes that no hack-specific bounty was found)",
  "https://www.binance.com/en/support/announcement/binance-security-breach-update-360028031711": "The May 2019 Binance hack, a different incident",
  "https://www.bnbchain.org/en/blog/bnb-chain-a-decentralized-response": "The October 2022 BSC Token Hub exploit, a different incident",
  "https://www.coinbase.com/en-gb/blog/bsc-token-hub-compromise-investigation-and-analysis-8": "Analysis of the October 2022 BSC Token Hub exploit, a different incident",
};

/** How much of each article we actually captured (raw/articles/). X posts are checked against tweets.json. */
export const ARTICLE_CAPTURE: Record<string, "full-text" | "snippet" | "not-captured"> = {
  "https://www.binance.com/en/support/announcement/detail/c5a8729a97ac486d963784d96c5642d7": "snippet",
  "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history": "full-text",
  "https://bitquery.io/investigations/binance-hack": "full-text",
  "https://808bits.com/articles/binance-hot-wallet-eip-7702-delegations/": "full-text",
  "https://dev.to/thevenice/how-a-53b-binance-hot-wallet-hack-worked-eip-7702-50-signatures-and-a-37-minute-race-2lea": "full-text",
  "https://www.cnbc.com/2026/10/29/circle-tether-freeze-funds-impacted-by-potential-binance-security-issue.html": "full-text",
  "https://www.cnbc.com/2026/10/30/billions-in-crypto-frozen-in-binance-hack-heres-what-happens-next-.html": "full-text",
  "https://techcrunch.com/2026/10/29/binance-pauses-withdrawals-as-hackers-suspected-of-stealing-billions-in-crypto/": "full-text",
  "https://apnews.com/article/binance-cryptocurrency-security-39cda8ceb8095e036334a18549d3d20d": "snippet",
  "https://www.coindesk.com/business/2026/10/29/potential-multi-billion-binance-hack-hitting-crypto-markets": "snippet",
  "https://www.coindesk.com/business/2026/10/30/binance-hack-drained-wallets-backing-customer-assets-reserve-data-shows": "snippet",
  "https://www.bbc.com/news/articles/cwg7xp8kx4v5o": "not-captured",
  "https://cryptoticker.io/en/binance-hack-on-chain-analysis/": "snippet",
};
