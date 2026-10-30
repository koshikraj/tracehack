# Trace the Hack: web app 

An unofficial dashboard that follows the funds from the October 2026 Binance hot-wallet hack. Not affiliated with Binance.

## Run
```bash
npm install
npm run snapshot     # builds public/snapshot.json from ../data (read-only)
npm run icons        # optional: refreshes public/icons (chain/token SVGs + source logos)
npm run avatars      # optional: refreshes public avatars + post images from X's embed endpoint (then rerun snapshot)
npm run dev
```
To enable the chat assistant, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`, then restart the dev server. Everything else works without keys.

## Layout
| Path | What |
|---|---|
| `scripts/build-snapshot.ts` | Builds the snapshot from `data/`: nodes, edges, holdings, totals, layout, timeline, sources. Every number traces to a file there. |
| `src/lib/types.ts` | Snapshot data contract (v1). |
| `src/components/FlowMap.tsx` | Canvas flow map: pan and zoom, particles, time filter, focus and path animation. |
| `src/components/*` | Rail, drawer, time bar, Sankey, address table, timeline, sources and method, chat. |
| `src/lib/agent.ts`, `src/app/api/chat/route.ts` | Claude tool loop. Data tools answer from the snapshot; view tools move the map in the browser. |
| `src/lib/live.ts`, `src/app/api/live/route.ts` | Re-reads the largest attacker-held native balances from free public endpoints (60 s cache). |

## Caveats
- USD uses today's prices. The m0 cleanup it reads is a first pass awaiting review.
- The chat rate limiter is in-memory and per server instance.
