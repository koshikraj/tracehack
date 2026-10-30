# Trace the Hack

An unofficial, independent dashboard that follows the funds stolen in the 29–30 October 2026 Binance hot-wallet hack, hop by hop, across Ethereum, Tron, Bitcoin, the XRP Ledger, Solana, Arbitrum, Avalanche and Polygon.

> **Unofficial.** Not affiliated with, endorsed by or connected to Binance or any exchange. Everything here comes from public blockchains and public reports, and may be incomplete or wrong.

## What you can do with it

- **Follow the money on a map.** Each chain is a lane. Funds flow left to right, from the drained Binance wallets through every hop to where they sit now. Zoom, pan and click any wallet to see its holdings, transfers, source and explorer link.
- **Replay the night.** Scrub or play through the hack minute by minute, with timeline events and posts appearing as they happened.
- **See where it sits now.** Totals for funds held by the attacker, frozen by issuers, in lending positions, recovered and commingled. These come from on-chain balance reads, kept separate from the estimates firms have published.
- **Watch for movement.** Every minute, the app re-reads the largest attacker-held balances and flags any wallet that has moved since the snapshot.
- **Ask Hop.** A built-in assistant (powered by Claude) answers questions from the data, with sources, and moves the map to show you.
- **Check every figure.** Each number shows its source and how sure we are: verified on-chain, traced on-chain or reported. The Sources page explains the method.

## Getting started

You need [Node.js](https://nodejs.org/) 20.9 or newer and git.

```bash
git clone https://github.com/koshikraj/tracehack.git
cd tracehack/web
npm install
npm run dev
```

Open http://localhost:3000. The dashboard works straight away. No accounts or keys are needed, except for the assistant.

### Turn on the assistant (optional)

The "Ask Hop" panel needs an Anthropic API key. Get one from the [Anthropic Console](https://console.anthropic.com/), then, in the `web` folder:

```bash
cp .env.example .env.local
```

Open `.env.local`, set `ANTHROPIC_API_KEY=` to your key and restart `npm run dev`. Your key stays on your machine: `.env.local` is never committed. To open the app with the assistant already showing, use http://localhost:3000/?assistant=open.

### Run a production build

```bash
npm run build
npm start
```

## Updating the data

The app reads one file, `web/public/snapshot.json`, built from the research data in `data/`. To rebuild it after changing the data:

```bash
npm run snapshot
```

Two optional commands refresh the images. They need internet access:

```bash
npm run icons     # chain and token icons, and source logos
npm run avatars   # profile pictures and images for the posts on the timeline
```

Run `npm run snapshot` again after `npm run avatars`.

## What's in this repo

| Folder | What it holds |
|---|---|
| `web/` | The dashboard: a Next.js app, plus the scripts that build its data and images. |
| `data/binance-hack/` | The research dataset: curated sources, timeline and address labels, transfer traces, balance and freeze reads, raw API responses and saved articles. |
| `data/pipeline-drafts/` | A first-pass cleanup of the traces (spam and fake-token transfers removed, each removal logged). It is still being reviewed. |

`data/README.md` describes each data file and how far to trust it.

## Reading the numbers

- **Dollar values use prices from 30 October**, not prices at the moment of theft. Firms' published totals use theft-time prices, so the two aren't directly comparable.
- **On-chain figures and reported figures are never added together.** Reported figures are labelled with who reported them.
- **Swaps and bridges aren't counted as attacker funds.** Money inside exchanges' trading pools, routers and bridges has moved on. The same goes for small transfers we haven't reviewed yet.
- **Attribution is shown only as "attributed by" the firm that made it.**

Spotted an error? Please open an issue with the wallet or transaction and a source.

## Licence

Code is released under the [MIT Licence](LICENSE). Logos, profile pictures, post images and saved articles belong to their owners and are included only to identify and cite sources.
