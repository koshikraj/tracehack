# Data index
Snapshot copied 30 Oct 2026, 12:15 PM IST. Times inside the files are UTC unless marked.

| Path | What | Status |
|---|---|---|
| `binance-hack/data/sources_curated.csv` | News, official, security-firm and analysis sources | AP/CoinDesk are snippets only; the Binance announcement is from a search snippet |
| `binance-hack/data/timeline_curated.csv` | 46 events, each with a source and confidence | Mixed: verified-onchain / verified (post) / reported |
| `binance-hack/data/labels_curated.csv` | 74 labelled addresses with source and confidence | Mixed. The TSUUV row is a service (SunSwap pool) |
| `binance-hack/data/related_incidents.csv` | Prior and related incidents | Some weakly sourced (CoinDCX, Predict.fun, Polymarket) |
| `binance-hack/first_exploit_txs.csv` | First exploit tx per chain | BTC, Tron and XRP verified on-chain. ETH was "reported" here; it is verified in `pipeline-drafts/m0/eth_first_exploit_verification.md`. SOL and L2s TODO |
| `binance-hack/out/*_edges.csv` | Draft traces (ETH 1,953 / Tron 1,221 / BTC 81 edges) | **Draft. ETH still has spoof/fake-token transfers**; no log index |
| `binance-hack/out/eth_state.json`, `token_freeze_status.json`, `tron_blacklist.json`, `l2_balances.json`, `misc_balances.json`, `*_addresses.json` | Balances and freeze flags read about 06:11 to 06:29 UTC on 30 Oct | On-chain reads. Avalanche/Polygon freeze and RLUSD unverified |
| `binance-hack/out/prices.json` | CoinGecko spot prices | **Today's prices, not prices at the time of theft** |
| `binance-hack/raw/` | Raw API responses, article captures, X posts | Source evidence |
| `binance-hack/scripts/` | Python tracers and checkers | Reference only |
| `binance-hack/tweets.json` | 196 X posts | Verified by post ID |
| `pipeline-drafts/m0/` | First-pass cleanup: ETH tx check (cutoff block 26300753), excluded_addresses, seeds_final (151; 58 pass-through need review), flows_clean (ETH 1,783/1,953, Tron 799/1,221, BTC 51/81), removed_edges (with rule), pre_exploit (19) | **First pass, awaiting review; not final** |

Key caveats:
- TSUUV… is a SunSwap pool, not an attacker wallet.
- The aUSDT at 0x8d53… is Aave collateral (count it as `in_lending_position`).
- Never mix today's prices with prices at the time of theft.
