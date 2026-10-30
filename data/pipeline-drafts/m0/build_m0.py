#!/usr/bin/env python3
"""M0 builder (DRAFT). Reads /workspace/binance-hack (READ ONLY) and writes only to this m0/ dir.
Outputs: excluded_addresses.csv, seeds_final.csv, flows_clean.csv, removed_edges.csv, pre_exploit.csv, m0_counts.json
"""
import csv, json, glob, re, collections, os
from decimal import Decimal
SRC='/workspace/binance-hack'; OUT=os.path.dirname(os.path.abspath(__file__))
def rd(p): return list(csv.DictReader(open(f'{SRC}/{p}')))
L=rd('data/labels_curated.csv')
E=rd('out/eth_edges.csv'); T=rd('out/tron_edges.csv'); B=rd('out/btc_edges.csv')
lines=lambda p:[l.split()[0] for l in open(f'{SRC}/{p}') if l.strip() and not l.startswith('#')]
seeds_eth=lines('seeds_eth.txt'); seeds_arb=lines('seeds_arb.txt'); check=lines('eth_check_list.txt')
bw=json.load(open(f'{SRC}/scripts/binance_wallets.json'))
bw_addrs=set(a.lower() for v in (bw.values() if isinstance(bw,dict) else [bw]) for a in (v if isinstance(v,list) else [v]) if isinstance(a,str) and a.startswith('0x'))
# ---------------- cutoffs (verified on chain, see ../raw/ and verification_eth_first_txs.md) ----------
CUT={'eth':'2026-10-29T20:20:59Z',   # 0xad99264d.. block 26300753, verified via publicnode RPC + Blockscout
     'tron':'2026-10-29T20:20:00Z',  # 6f983ab7.. verified by dataset owner (first_exploit_txs.csv)
     'btc':'2026-10-29T20:20:06Z'}   # f9dcbbc6.. block 973732, verified by dataset owner
ts=lambda s: s.replace('.000000Z','Z')
# ---------------- token allowlists ----------------
CANON_ETH={'USDT':'0xdac17f958d2ee523a2206206994597c13d831ec7','USDC':'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
 'WETH':'0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2','WBTC':'0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
 'RLUSD':'0x8292bb45bf1ee4d140127049757c2e0ff06317ed','DAI':'0x6b175474e89094c44da98b954eedeac495271d0f','ETH':None}
rc=json.load(open(f'{OUT}/../raw/eth_rpc/receipt_0x53bd38b8.json'))['response']['result']
DRAIN_TOKENS=set(l['address'].lower() for l in rc['logs'])   # 63 tokens moved in verified main drain tx
SYM_OK=re.compile(r'^[A-Za-z0-9.$_-]{1,15}$')
def eth_fake(r):
    if r['kind']!='token_transfer': return None
    s=r['asset']; c=(r['token_address'] or '').lower()
    if not SYM_OK.match(s): return f'fake_token: non-standard/non-ASCII symbol {s!r} contract {c}'
    if s.upper() in CANON_ETH and CANON_ETH[s.upper()]!=c: return f'fake_token: canonical symbol {s} on non-canonical contract {c}'
    return None
# Tron token contracts recovered from raw TronGrid trc20 responses
tron_tok={}
for f in glob.glob(f'{SRC}/raw/trongrid/*.json'):
    try: d=json.load(open(f))['response']
    except Exception: continue
    for x in (d.get('data') or []) if isinstance(d,dict) else []:
        if isinstance(x,dict) and 'token_info' in x:
            tron_tok[(x['transaction_id'],x['from'],x['to'])]=x['token_info'].get('address')
CANON_TRON={'USDT':'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t','USDD':'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz','jUSDT':'TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd'}
TRON_SERVICES={'TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx':'SunSwap V3 WTRX/USDT pool (dataset-owner correction; HANDOFF.md)',
 'TQqgNg':'router (labels_curated.csv service)','TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd':'JustLend jUSDT market (token contract)',
 'TVjuTE3V5bMVdpfNhid8kD2v35T2k1u1Br':'DEX/pool contract (HANDOFF.md TODO 1 list)','TSUYvQ5tdd3DijCD1uGunGLpftHuSZ12sQ':'DEX/pool contract (HANDOFF.md)',
 'TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ':'S-USDT-TRX SunSwap LP (HANDOFF.md; token_info in raw/trongrid)','TFG4wBaDQ8sHWWP1ACeSGnoNR6RRzevLPt':'DEX/pool contract (HANDOFF.md)'}
for r in L:  # resolve TQqgNg prefix to full address from labels
    if r['chain']=='tron' and r['address'].startswith('TQqgNg'): TRON_SERVICES[r['address']]=TRON_SERVICES.pop('TQqgNg')
# ---------------- anchors (known real addresses) ----------------
anch=collections.defaultdict(dict)  # chain -> addr_lower -> source
for r in L:
    ch={'arb':'eth'}.get(r['chain'],r['chain'])  # same EVM address space for lookalike purposes
    a=r['address'] if r['chain'] in ('tron','btc','xrp','sol') else r['address'].lower()
    anch[ch][a]=f"labels_curated.csv:{r['label']}"
for a in seeds_eth: anch['eth'].setdefault(a.lower(),'seeds_eth.txt')
for a in seeds_arb: anch['eth'].setdefault(a.lower(),'seeds_arb.txt')
for a in check: anch['eth'].setdefault(a.lower(),'eth_check_list.txt')
for a in bw_addrs: anch['eth'].setdefault(a,'scripts/binance_wallets.json')
ta=json.load(open(f'{SRC}/out/tron_addresses.json'))
for a in ta: anch['tron'].setdefault(a,'out/tron_addresses.json')
# ---------------- lookalike detection ----------------
def lk_key_eth(a): return a[2:5], a[-4:]
def common_pre(a,b):
    n=0
    for x,y in zip(a,b):
        if x!=y: break
        n+=1
    return n
def common_suf(a,b): return common_pre(a[::-1],b[::-1])
def legit_flow(rows,addr,fakefn):
    v=0
    for r in rows:
        if addr in (r['from_'].lower(), r['to'].lower()) and not fakefn(r) and float(r['amount'] or 0)>0:
            v+=float(r.get('usd_current') or 0) or float(r['amount'])*1e-9
    return v
excluded={}  # (chain,addr)->row
def excl(chain,addr,reason,real,evidence,scope):
    k=(chain,addr)
    if k in excluded: excluded[k]['evidence']+=' | '+evidence; return
    excluded[k]=dict(chain=chain,address=addr,reason=reason,matched_real_address=real,evidence=evidence,scope=scope)
eth_addrs=set(r['from_'].lower() for r in E)|set(r['to'].lower() for r in E)
first_tx=collections.defaultdict(list)
for r in E:
    for a in (r['from_'].lower(),r['to'].lower()): first_tx[a].append(r)
known_eth=set(anch['eth'])
# pairwise: candidate vs every known/edge address; prefix>=3 hex after 0x and suffix>=4 hex
pool=sorted(eth_addrs|known_eth)
groups=collections.defaultdict(set)
for i,a in enumerate(pool):
    for b in pool[i+1:]:
        if common_pre(a[2:],b[2:])>=3 and common_suf(a,b)>=4: groups[a].add(b); groups[b].add(a)
# union-find into components
seen=set(); comps=[]
for a in pool:
    if a in seen or a not in groups: continue
    st=[a]; c=set()
    while st:
        x=st.pop()
        if x in c: continue
        c.add(x); st+=list(groups[x])
    seen|=c; comps.append(c)
for c in comps:
    real=[x for x in c if x in known_eth]
    basis='anchor in '+', '.join(sorted(set(anch['eth'][x] for x in real))) if real else None
    if not real:  # unanchored: real = member with largest non-fake value flow
        real=[max(c,key=lambda x: legit_flow(E,x,eth_fake))]; basis='largest non-fake value flow in group (unanchored; lower confidence)'
    for x in sorted(c-set(real)):
        rr=real[0]
        ev=[r for r in first_tx[x]]
        evs=';'.join(sorted(set(f"{r['tx_hash']}({'fake:'+r['asset'] if eth_fake(r) else r['asset']} {r['amount']})" for r in ev))[:4])
        excl('eth',x,f'lookalike_vanity: shares {common_pre(x[2:],rr[2:])} leading + {common_suf(x,rr)} trailing hex chars with real address',rr,
             f"{basis}; edges in out/eth_edges.csv: {len(ev)}; e.g. {evs}",'seeds+expansion+totals')
# fake token contracts
for r in E:
    f=eth_fake(r)
    if f: excl('eth',r['token_address'].lower(),'fake_token_contract: '+f.split(': ',1)[1].split(' contract')[0],
               CANON_ETH.get(r['asset'].upper()) or '', f"first seen tx {r['tx_hash']} in out/eth_edges.csv",'token allowlist (never counted)')
excl('eth','0x0000000000000000000000000000000000000000','zero_address','', 'HANDOFF.md TODO 1 rule','seeds+expansion+totals')
# Tron services and spam token
for a,why in TRON_SERVICES.items(): excl('tron',a,'service_contract_not_attacker: '+why,'', 'HANDOFF.md TODO 1; README.md; out/tron_addresses.json is_contract','seeds+balances (keep edges as swap/lend venue)')
for (tx,f,t),c in tron_tok.items():
    pass
# ---------------- edge cleaning ----------------
seed_like=set(a for a,s in anch['eth'].items() if not s.startswith('scripts/binance'))
lk_eth=set(a for (ch,a),v in excluded.items() if ch=='eth' and v['reason'].startswith('lookalike'))
seed_tron=set(r['address'] for r in L if r['chain']=='tron' and r['category'] in('attacker_held','attacker_frozen'))|set(ta)
seed_btc=set(json.load(open(f'{SRC}/out/btc_addresses.json')))|set(r['address'] for r in L if r['chain']=='btc')
COLS=['chain','from','to','asset','token_address','amount','tx_hash','timestamp_utc','block','kind','to_name','usd_current_DRAFT','src_file','src_row','flags']
clean=[];removed=[];pre=[]
def norm(chain,r,i,src,tok=''):
    return dict(chain=chain,**{'from':r['from_'],'to':r['to']},asset=r['asset'],token_address=tok or r.get('token_address',''),amount=r['amount'],
                tx_hash=r['tx_hash'],timestamp_utc=ts(r['timestamp_utc']),block=r.get('block',''),kind=r['kind'],to_name=r.get('to_name',''),
                usd_current_DRAFT=r.get('usd_current',''),src_file=src,src_row=i+2,flags='')
dupkey=collections.Counter((r['tx_hash'],r['from_'],r['to'],r['asset'],r['amount']) for r in E)
for i,r in enumerate(E):
    n=norm('eth',r,i,'out/eth_edges.csv'); f,t=r['from_'].lower(),r['to'].lower(); amt=float(r['amount'] or 0)
    if n['timestamp_utc']<CUT['eth']:
        if f in seed_like or t in seed_like: pre.append(dict(n,flags='pre_exploit_seed_activity')); continue
        removed.append(dict(n,rule='pre_exploit_unrelated',rule_detail=f"before verified ETH cutoff {CUT['eth']} (tx 0xad99264d…, block 26300753); no seed endpoint")); continue
    fk=eth_fake(r)
    if fk: removed.append(dict(n,rule='fake_token',rule_detail=fk)); continue
    if amt==0: removed.append(dict(n,rule='zero_value_transfer',rule_detail='0-amount Transfer (spoofed transferFrom pattern; 3 sampled txs sent by 3rd parties, see ../raw/eth_rpc/)')); continue
    if f in lk_eth or t in lk_eth: removed.append(dict(n,rule='lookalike_endpoint',rule_detail='endpoint in excluded_addresses.csv: '+(f if f in lk_eth else t))); continue
    if r['asset'] in('ETH','WETH') and amt<1e-5 and f not in seed_like: removed.append(dict(n,rule='dust_poisoning',rule_detail='<0.00001 ETH from non-seed sender')); continue
    if dupkey[(r['tx_hash'],r['from_'],r['to'],r['asset'],r['amount'])]>1: n['flags']='possible_duplicate_no_log_index'
    if r['kind']=='token_transfer' and (r['token_address'] or '').lower() not in DRAIN_TOKENS and (r['token_address'] or '').lower() not in CANON_ETH.values():
        n['flags']=(n['flags']+';' if n['flags'] else '')+'token_not_in_verified_drain_set'
    clean.append(n)
tron_unknown_tok=0
for i,r in enumerate(T):
    tok=tron_tok.get((r['tx_hash'],r['from_'],r['to']),'') if r['kind']=='trc20' else ''
    n=norm('tron',r,i,'out/tron_edges.csv',tok); amt=float(r['amount'] or 0)
    if n['timestamp_utc']<CUT['tron']:
        (pre.append(dict(n,flags='pre_exploit_seed_activity')) if (r['from_'] in seed_tron or r['to'] in seed_tron) else removed.append(dict(n,rule='pre_exploit_unrelated',rule_detail='before Tron cutoff'))); continue
    if r['kind']=='trc20':
        if r['asset'] in CANON_TRON and tok and tok!=CANON_TRON[r['asset']]:
            removed.append(dict(n,rule='fake_token',rule_detail=f"symbol {r['asset']} on non-canonical {tok}")); continue
        if r['asset'] not in CANON_TRON:
            removed.append(dict(n,rule='fake_token',rule_detail=f"spam/unlisted token {r['asset']!r} contract {tok or 'unknown'}")); 
            if tok: excl('tron',tok,'fake_or_spam_token_contract','', f"symbol {r['asset']!r}; tx {r['tx_hash']}",'token allowlist (never counted)')
            continue
        if not tok: tron_unknown_tok+=1; n['flags']='token_contract_not_recovered'
    if amt==0: removed.append(dict(n,rule='zero_value_transfer',rule_detail='0 amount')); continue
    if r['asset']=='TRX' and amt<=0.001 and r['from_'] not in seed_tron:
        removed.append(dict(n,rule='dust_poisoning',rule_detail='<=0.001 TRX from non-seed sender into tracked address'))
        excl('tron',r['from_'],'dust_poisoning_sender',r['to'],f"{r['amount']} TRX tx {r['tx_hash']}",'expansion (never follow)'); continue
    if r['to'] in TRON_SERVICES or r['from_'] in TRON_SERVICES: n['flags']='service_counterparty'
    clean.append(n)
for i,r in enumerate(B):
    n=norm('btc',r,i,'out/btc_edges.csv'); amt=float(r['amount'] or 0)
    if n['timestamp_utc']<CUT['btc']:
        (pre.append(dict(n,flags='pre_exploit_seed_activity')) if (r['from_'] in seed_btc or r['to'] in seed_btc) else removed.append(dict(n,rule='pre_exploit_unrelated',rule_detail='before BTC cutoff'))); continue
    if amt==0: removed.append(dict(n,rule='zero_value_transfer',rule_detail='0 amount')); continue
    if amt<0.0001 and r['from_'] not in seed_btc:
        removed.append(dict(n,rule='dust_poisoning',rule_detail='<0.0001 BTC input from untracked address into lot'))
        excl('btc',r['from_'],'dust_sender',r['to'],f"{r['amount']} BTC tx {r['tx_hash']}",'expansion (never follow)'); continue
    n['flags']='no_vout_vin_index'
    clean.append(n)

# ---------------- pre-exploit seed activity from Blockscout raw archive (../raw/blockscout_eth/) ----------------
RAW=f'{OUT}/../raw/blockscout_eth'
def bs_rows(fname,kind):
    p=f'{RAW}/{fname}'
    if not os.path.exists(p): return []
    out=[]
    for i in json.load(open(p))['response'].get('items',[]):
        t=i['timestamp'].replace('.000000Z','Z')
        if t>=CUT['eth'] and (i.get('hash') or i.get('transaction_hash'))!='0xad99264d5532ae0dd04b2004eebda05f25657e70dacb764f7ac8d4ccd051298b': continue
        fr=i['from']['hash']; to=(i.get('to') or {}).get('hash') or ''
        cc=(i.get('created_contract') or {}).get('hash')
        if kind=='token':
            tok=i.get('token') or {}; dec=int(tok.get('decimals') or 18); val=Decimal(int((i.get('total') or {}).get('value') or 0))/Decimal(10**dec)
            asset=tok.get('symbol') or '?'; taddr=tok.get('address_hash') or tok.get('address') or ''; k='token_transfer'
        else:
            val=Decimal(int(i.get('value') or 0))/Decimal(10**18); asset='ETH'; taddr=''; k='internal_tx' if kind=='internal' else ('contract_creation' if cc else 'tx')
        if kind=='tx' and i.get('method'): k+=f" method={i['method']}"
        if kind=='tx' and str(i.get('raw_input','0x'))[:10]=='0x8a179be4' or (kind=='tx' and i.get('method')=='0x8a179be4'): k+=' (same selector as main drain 0x53bd38b8)'
        names='; '.join(x for x in [i['from'].get('name') and f"from_name={i['from']['name']}", (i.get('to') or {}).get('name') and f"to_name={i['to']['name']}", cc and f'created_contract={cc}', i.get('nonce') is not None and kind=='tx' and f"sender_nonce={i['nonce']}"] if x)
        out.append(dict(chain='eth',**{'from':fr,'to':to or (cc or '')},asset=asset,token_address=taddr,amount=format(val.normalize(),'f'),tx_hash=i.get('hash') or i.get('transaction_hash'),
            timestamp_utc=t,block=i.get('block_number') or i.get('block') or '',kind=k,to_name=names,usd_current_DRAFT='',src_file='pipeline/raw/blockscout_eth/'+fname,src_row='',flags='pre_exploit_seed_activity'))
    return out
seenk=set()
for fname,kind in [('operator_transactions.json','tx'),('operator_transactions_p2.json','tx'),('operator_internal-transactions.json','internal'),('operator_token-transfers.json','token'),
                   ('funder_e4f9_transactions.json','tx'),('funder_e4f9_internal-transactions.json','internal')]:
    for r in bs_rows(fname,kind):
        key=(r['tx_hash'],r['from'].lower(),r['to'].lower(),r['kind'].split()[0])
        if key in seenk: continue
        seenk.add(key)
        if r['tx_hash'].startswith('0xad99264d'): r['flags']+=';cutoff_tx_eip7702_setup_VERIFIED'
        pre.append(r)
pre.sort(key=lambda r:r['timestamp_utc'])
def w(name,rows,cols):
    with open(f'{OUT}/{name}','w',newline='') as fh:
        x=csv.DictWriter(fh,fieldnames=cols,extrasaction='ignore'); x.writeheader(); x.writerows(rows)
w('flows_clean.csv',clean,COLS); w('removed_edges.csv',removed,COLS+['rule','rule_detail']); w('pre_exploit.csv',pre,COLS)
exrows=sorted(excluded.values(),key=lambda r:(r['chain'],r['reason'],r['address']))
w('excluded_addresses.csv',exrows,['chain','address','reason','matched_real_address','evidence','scope'])
# ---------------- seeds_final ----------------
ex_set=set((r['chain'],r['address'].lower() if r['chain']=='eth' else r['address']) for r in exrows)
seeds=[]; have=set()
def add(chain,addr,role,source,conf,notes):
    k=(chain,addr.lower() if addr.startswith('0x') else addr)
    if k in have: return
    if (('eth' if chain in('eth','arb','avalanche','polygon') else chain),k[1]) in ex_set and not role.startswith('victim'): return
    have.add(k); seeds.append(dict(chain=chain,address=addr,role=role,source=source,confidence=conf,notes=notes))
ROLE={'operator':'attacker_operator','contract':'attacker_contract','attacker_held':'attacker_held','attacker_frozen':'attacker_frozen',
      'rescued':'attacker_rescued','commingled':'commingled_counterparty','victim':'victim_hot_wallet','victim_or_binance':'victim_or_binance','related_incident':'related_incident'}
for r in L:
    if r['category']=='service': continue
    if r['address'].startswith('TSUUV'): continue
    add(r['chain'],r['address'],ROLE.get(r['category'],r['category']),f"data/labels_curated.csv ({r['source']}; {r['source_url']})",r['confidence'],(r['label']+'. '+r['notes']).strip())
txt=open(f'{SRC}/raw/articles/bitquery_investigation.txt').read()
for a,n,amt in re.findall(r'(bc1\w+) BTC lot (\d+) \(([\d,.]+) BTC\)',txt):
    add('btc',a,'attacker_held',f'raw/articles/bitquery_investigation.txt (BTC lot {n}); balance out/btc_addresses.json','reported+balance-onchain',f'{amt} BTC lot per Bitquery')
for a,v in json.load(open(f'{SRC}/out/btc_addresses.json')).items():
    add('btc',a,'candidate_hop','out/btc_edges.csv tracer (trace_btc.py)','traced-onchain',f"balance {v.get('balance_btc')} BTC at draft snapshot; review")
l2=json.load(open(f'{SRC}/out/l2_balances.json'))
for ch in ('avalanche','polygon'):
    add(ch,'0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c','attacker_held','out/l2_balances.json (publicnode RPC)','verified-onchain','main receiver on '+ch+'; stablecoin freeze status UNVERIFIED (blacklist call reverted)')
add('tron','TCzBTkqn66yApqbYoPezaEQosM5DAd7Y62','attacker_frozen','out/tron_blacklist.json + logs/trace_tron.log (depth 2)','verified-onchain','65,990,000 USDT, isBlackListed=true; no label in labels_curated')
for a,v in ta.items():
    if v.get('is_contract'): continue
    add('tron',a,'candidate_hop','out/tron_addresses.json tracer (trace_tron.py)','traced-onchain',f"depth {v.get('depth')}; TRX {round(v.get('trx',0),2)} USDT {round(v.get('usdt',0),2)}; created {v.get('created')}; review")
summ=json.load(open(f'{SRC}/out/eth_summary.json'))
for a in summ['visited']:
    info=summ['info'].get(a,{}) if isinstance(summ.get('info'),dict) else {}
    if info.get('is_contract'): continue
    add('eth',a,'candidate_hop','out/eth_summary.json tracer (trace_evm.py)','traced-onchain','visited by BFS; review before treating as attacker')
add('xrp','rK21t6nGLy4MNDqhvy3pGwcLFy25qgfzMx','attacker_held','out/misc_balances.json + labels_curated.csv','verified-onchain','233,461,943.1 XRP')
mixers=[]
for r in pre:
    for a,nm in [(r['from'],'from'),(r['to'],'to')]:
        if a.lower() in ('0x7c8601d4645b93cea45f71e118a729332e6b5ca0','0xe4f9070e1316de2988fc6f869fead8fb99cc74cd','0x28c6c06298d514db089934071355e5743bf21d60'): continue
        if 'TornadoCash' in r['to_name'] and nm=='from':
            mixers.append(dict(chain='eth',address=a,reason='service_contract_mixer: '+r['to_name'].split(';')[0],matched_real_address='',evidence=f"paid attacker seed {r['to']} {r['amount']} ETH tx {r['tx_hash']} ({r['src_file']})",scope='seeds+expansion (label as mixer; funding-source endpoint)'))
        elif nm=='to':
            add('eth',a,'attacker_prep_contract_or_test_target (lead)',r['src_file'],'traced-onchain',f"pre-exploit {r['kind']} by attacker seed at {r['timestamp_utc']} tx {r['tx_hash']}; {r['to_name']}")
seenm=set()
for m in mixers:
    if m['address'] not in seenm: seenm.add(m['address']); exrows.append(m)
w('excluded_addresses.csv',exrows,['chain','address','reason','matched_real_address','evidence','scope'])
w('seeds_final.csv',seeds,['chain','address','role','source','confidence','notes'])
counts=dict(eth_edges_in=len(E),tron_edges_in=len(T),btc_edges_in=len(B),
  clean=collections.Counter(r['chain'] for r in clean),removed=collections.Counter(r['chain'] for r in removed),
  removed_by_rule=collections.Counter(f"{r['chain']}:{r['rule']}" for r in removed),pre_exploit=len(pre),
  excluded_by_reason=collections.Counter(f"{r['chain']}:{r['reason'].split(':')[0]}" for r in exrows),
  seeds_by_chain_role=collections.Counter(f"{r['chain']}:{r['role']}" for r in seeds),tron_trc20_token_contract_unrecovered=tron_unknown_tok,
  drain_tokens=len(DRAIN_TOKENS))
json.dump(counts,open(f'{OUT}/m0_counts.json','w'),indent=1); print(json.dumps(counts,indent=1))
