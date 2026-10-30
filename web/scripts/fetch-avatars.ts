/**
 * Downloads public profile pictures and post images for the curated accounts in scripts/accounts.ts,
 * via X's public embed endpoint (cdn.syndication.twimg.com, no key). Writes:
 *   public/avatars/<handle>.jpg, public/media/<tweetId>-<n>.jpg, public/avatars/manifest.json
 * Run: npm run avatars   (then npm run snapshot to merge into the snapshot)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POST_ACCOUNTS, EXCLUDED_POSTS } from "./accounts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TWEETS = path.resolve(here, "../../data/binance-hack/tweets.json");
const PUB = path.resolve(here, "../public");
const MAX_MEDIA_PER_POST = 2;

const token = (id: string) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embed(id: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token(id)}&lang=en`);
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }
  return null;
}

async function download(url: string, file: string): Promise<boolean> {
  const r = await fetch(url);
  if (!r.ok) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 200) return false;
  fs.writeFileSync(file, buf);
  return true;
}

async function main() {
  fs.mkdirSync(path.join(PUB, "avatars"), { recursive: true });
  fs.mkdirSync(path.join(PUB, "media"), { recursive: true });
  const tweets = (JSON.parse(fs.readFileSync(TWEETS, "utf8")) as any[]).filter((t) => POST_ACCOUNTS[t.author] && !t.is_retweet && !EXCLUDED_POSTS[t.id]);
  const manifest: { fetchedUtc: string; avatars: Record<string, string>; verified: Record<string, boolean>; media: Record<string, string[]> } =
    { fetchedUtc: new Date().toISOString(), avatars: {}, verified: {}, media: {} };

  for (const t of tweets) {
    const j = await embed(t.id);
    await sleep(150);
    if (!j) { console.warn(`  no embed for ${t.author}/${t.id}`); continue; }
    const acct = POST_ACCOUNTS[t.author];
    if (!manifest.avatars[t.author] && acct.avatar !== false && j.user?.profile_image_url_https) {
      const big = String(j.user.profile_image_url_https).replace("_normal.", "_200x200.");
      const file = path.join(PUB, "avatars", `${t.author}.jpg`);
      if (await download(big, file) || await download(j.user.profile_image_url_https, file)) manifest.avatars[t.author] = `/avatars/${t.author}.jpg`;
      manifest.verified[t.author] = !!(j.user.is_blue_verified || j.user.verified);
    }
    if (acct.avatar === false) continue; // no images from the official Binance account either (branded)
    const photos = ((j.mediaDetails ?? []) as any[]).filter((m) => m.type === "photo").slice(0, MAX_MEDIA_PER_POST);
    for (const [i, m] of photos.entries()) {
      const file = path.join(PUB, "media", `${t.id}-${i}.jpg`);
      if (await download(`${m.media_url_https}?name=small`, file)) (manifest.media[t.id] ??= []).push(`/media/${t.id}-${i}.jpg`);
    }
  }
  fs.writeFileSync(path.join(PUB, "avatars", "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`avatars: ${Object.keys(manifest.avatars).length}/${Object.keys(POST_ACCOUNTS).length} accounts, media for ${Object.keys(manifest.media).length} posts`);
}
main();
