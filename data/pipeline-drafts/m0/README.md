# M0 outputs — DRAFT first pass (built 2026-10-30 12:14 IST)
Built by `build_m0.py`, which reads /workspace/binance-hack/ (read only; nothing is written there) and writes only to this folder. Re-run it after the dataset changes.
USD values in `usd_current_DRAFT` come from out/ and use **current** prices, not prices at the time of theft. Historical pricing is deferred until after M0.

## Files
| file | rows | what |
|---|---|---|
| eth_first_exploit_verification.md | – | both ETH first-exploit txs VERIFIED on chain, plus the method and pre-exploit operator history |
| excluded_addresses.csv | 528 | chain,address,reason,matched_real_address,evidence,scope |
| seeds_final.csv | 151 | chain,address,role,source,confidence,notes (TSUUV pool and all excluded addresses removed) |
| flows_clean.csv | 2633 | ETH 1783, Tron 799, BTC 51 |
| removed_edges.csv | 622 | every dropped edge, with `rule` and `rule_detail` |
| pre_exploit.csv | 19 | pre-cutoff activity of attacker seeds (funding-source leads) |
| m0_counts.json | – | machine-readable counts |

## Row counts (before → clean + removed)
| chain | in (out/*_edges.csv) | clean | removed |
|---|---|---|---|
| ETH | 1953 | 1783 | 170 |
| Tron | 1221 | 799 | 422 |
| BTC | 81 | 51 | 30 |
| total | 3255 | 2633 | 622 |

Every input row lands in exactly one of the two files (clean + removed = in).
The 19 pre_exploit.csv rows are **extra** rows pulled from Blockscout (raw/blockscout_eth/). They are not from out/: the tracer started at 2026-10-29T00:00, and none of its 4 pre-cutoff edges touched a seed.

Removed by rule: {"eth:fake_token": 156, "eth:zero_value_transfer": 3, "eth:lookalike_endpoint": 6, "eth:dust_poisoning": 1, "eth:pre_exploit_unrelated": 4, "tron:fake_token": 2, "tron:dust_poisoning": 420, "btc:dust_poisoning": 30}

## Rules (applied in this order)
1. **Cutoffs, all verified:**
   - ETH 2026-10-29T20:20:59Z (block 26300753, tx 0xad99264d…; we verified this on chain)
   - Tron 20:20:00Z and BTC 20:20:06Z (marked verified in the dataset's first_exploit_txs.csv)

   An earlier edge goes to `pre_exploit.csv` if it touches a seed. Otherwise it is `pre_exploit_unrelated`. Result: 4 ETH edges, all 0xd51fca94… → 0x70e3…/0x70ec… with fake Е⁯ΤН⁯ mixed in.
2. **fake_token:**
   - ETH: symbol not matching `^[A-Za-z0-9.$_-]{1,15}$` (homoglyph, invisible, whitespace — catches "Е⁯ΤН⁯", "ET​​H", "U⁯S⁯DΤ", "ERC "), or a canonical symbol (ETH/USDT/USDC/WETH/WBTC/RLUSD/DAI) on a non-canonical contract.
   - Tron: TRC-20 whose symbol is not USDT/USDD/jUSDT on its canonical contract. The contract comes from raw/trongrid token_info; all were recovered. This catches "TG:JF4888".
3. **zero_value_transfer:** amount 0. On chain, the 3 ETH cases were sent by third-party EOAs (0xd6434d15…, 0xea264b7e…), not by the seed — the transferFrom-spoof pattern. Files: raw/eth_rpc/tx_0x6eed2369/0x63461684/0x7661a195.json.
4. **lookalike_endpoint:** either endpoint is a `lookalike_vanity` address in excluded_addresses.csv. The match rule is ≥3 leading and ≥4 trailing hex characters shared with a real address. Real addresses (anchors) come from labels_curated.csv, seeds_eth.txt, seeds_arb.txt, eth_check_list.txt and binance_wallets.json. In a group with no anchor, the member with the largest non-fake value flow counts as real; those rows are marked "unanchored; lower confidence" (19 addresses). All 4 spoofs named in README/HANDOFF, and fake ETH 0x6dcb3cb5…, are caught. Most lookalike edges were already dropped as fake_token.
5. **dust_poisoning:**
   - ETH/WETH below 0.00001 from a non-seed
   - TRX ≤ 0.001 from a non-seed (414 senders → excluded as `dust_poisoning_sender`)
   - BTC below 0.0001 from an untracked sender (e.g. 1AutiSmAHH… paying 0.00001 to most lots; 17 senders excluded)

**Flags only (the edge is kept):**
- `possible_duplicate_no_log_index`: 3 rows, e.g. the AAVE triple in tx 0x331cb88e…
- `token_not_in_verified_drain_set`: 3
- `service_counterparty`: 41 Tron edges with SunSwap/JustLend/etc. contracts
- `no_vout_vin_index`: all 51 BTC edges

The edge key (chain, tx_hash, log_index | vout/vin) cannot be built from out/ because log_index and vout are missing.

## Seeds (seeds_final.csv) by chain
{
"eth:victim_hot_wallet": 3,
"eth:victim_or_binance": 3,
"eth:attacker_operator": 2,
"eth:attacker_contract": 2,
"eth:attacker_frozen": 8,
"eth:attacker_held": 19,
"arb:attacker_rescued": 1,
"eth:commingled_counterparty": 10,
"eth:related_incident": 5,
"arb:victim_hot_wallet": 3,
"avalanche:victim_hot_wallet": 4,
"btc:victim_hot_wallet": 1,
"btc:attacker_held": 20,
"tron:victim_hot_wallet": 1,
"tron:attacker_frozen": 2,
"tron:attacker_held": 4,
"xrp:attacker_held": 1,
"sol:victim_hot_wallet": 1,
"sol:attacker_held": 1,
"btc:candidate_hop": 10,
"avalanche:attacker_held": 1,
"polygon:attacker_held": 1,
"tron:candidate_hop": 29,
"eth:candidate_hop": 15,
"eth:attacker_prep_contract_or_test_target (lead)": 4
}

**Sources:**
- labels_curated.csv: all non-service rows. Includes victims (`victim_hot_wallet`, a drain source that is never counted as attacker-held) plus `commingled_counterparty` and `related_incident`, so the loader can filter by role.
- Bitquery BTC lots (raw/articles/bitquery_investigation.txt)
- tracer-visited addresses, as `candidate_hop` with confidence traced-onchain. **These need review**: they may include market makers.
- TCzBTk… (Tron, frozen, previously unlabelled)
- 0x5227 on Avalanche and Polygon
- 4 new ETH prep or test addresses found from the operator history: 0x19beE294…, 0x837810E3…, 0x9C29BA2D…, 0x43AEdb9B…

Excluded from seeds: TSUUV… (SunSwap pool) and TQqgNg… (router). Both Tornado pools are in excluded_addresses.csv as `service_contract_mixer`.

## Not confirmed / open
- Binance 14's historical nonce/code (needs archive RPC). Authorization status comes from Blockscout only.
- The 19 unanchored ETH lookalike groups: which member is real is a heuristic.
- Tron lookalikes: none found by prefix/suffix. Tron poisoning is dust only (420 edges).
- No Arbitrum, Solana, XRP, L2 or Avalanche edges (deferred). The Arbitrum Blockscout call returned 403.
- The 4 prep/test addresses have not been traced forward.
- Candidate hops are not yet classified (exchange deposit, market maker, or attacker).
