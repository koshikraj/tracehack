#!/usr/bin/env python3
"""Trace outgoing flows from attacker seed addresses on an EVM chain via public Blockscout API v2.
Usage: python3 trace_evm.py <chain> <seeds_file> [max_depth] [max_addrs]
chain: eth|arb|op|base  (blockscout instance)
Writes cache/<chain>_*.json and out/<chain>_edges.csv, out/<chain>_addresses.csv
Recurse rule: recipient is an EOA with < MAXTX transactions (fresh/low-activity wallet) and not a known Binance wallet.
All data are fetched live; nothing is invented. USD values use Blockscout's *current* exchange_rate unless noted.
"""
import sys, json, time, csv, os, urllib.request, urllib.parse
HOSTS={'eth':'https://eth.blockscout.com','arb':'https://arbitrum.blockscout.com','op':'https://optimism.blockscout.com','base':'https://base.blockscout.com'}
chain=sys.argv[1]; H=HOSTS[chain]
seeds=[l.split()[0].strip() for l in open(sys.argv[2]) if l.strip() and not l.startswith('#')]
MAXD=int(sys.argv[3]) if len(sys.argv)>3 else 3
MAXA=int(sys.argv[4]) if len(sys.argv)>4 else 150
MAXTX=600
SINCE='2026-10-29T00:00:00'
BINANCE=set(a.lower() for a in json.load(open(os.path.join(os.path.dirname(__file__),'binance_wallets.json'))).get(chain,[]))
CACHE=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','raw',f'blockscout_{chain}'); os.makedirs(CACHE,exist_ok=True); os.makedirs('out',exist_ok=True)
def get(path,params=None,tries=5):
    url=H+path+('?'+urllib.parse.urlencode(params) if params else '')
    for i in range(tries):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 research','accept':'application/json'})
            with urllib.request.urlopen(req,timeout=40) as r: 
                time.sleep(0.15); return json.loads(r.read())
        except Exception as e:
            err=e; time.sleep(1.5*(i+1))
    print('FAIL',url,err,file=sys.stderr); return None
def paged(path,params,limit_pages=30):
    out=[];p=dict(params)
    for _ in range(limit_pages):
        d=get(path,p)
        if not d: break
        items=d.get('items',[]); out+=items
        stop=any((it.get('timestamp') or '9')<SINCE for it in items)
        npp=d.get('next_page_params')
        if not npp or stop: break
        p=dict(params); p.update({k:v for k,v in npp.items() if v is not None})
    return out
info={}
def addr_info(a):
    a=a.lower()
    if a in info: return info[a]
    d=get(f'/api/v2/addresses/{a}') or {}
    c=get(f'/api/v2/addresses/{a}/counters') or {}
    info[a]=dict(address=a,is_contract=d.get('is_contract'),name=d.get('name'),tags=[t.get('display_name') for t in (d.get('public_tags') or [])]+([d['metadata']['tags'][0]['name']] if d.get('metadata') and d['metadata'].get('tags') else []),
        coin_balance=int(d.get('coin_balance') or 0)/1e18,eth_rate=float(d.get('exchange_rate') or 0),tx_count=int(c.get('transactions_count') or 0),
        transfers_count=int(c.get('token_transfers_count') or 0))
    return info[a]
edges=[];visited={};queue=[(s.lower(),0) for s in seeds]
while queue and len(visited)<MAXA:
    a,dep=queue.pop(0)
    if a in visited: continue
    visited[a]=dep
    print(f'[{len(visited)}] depth {dep} {a}',file=sys.stderr)
    cf=f'{CACHE}/{a}.json'
    if os.path.exists(cf) and time.time()-os.path.getmtime(cf)<float(os.environ.get('CACHE_TTL','7200')):
        c=json.load(open(cf)); tts,txs,itx,ins=c['tt'],c['tx'],c['itx'],c['tt_in']
    else:
        tts=paged(f'/api/v2/addresses/{a}/token-transfers',{'filter':'from'})
        txs=paged(f'/api/v2/addresses/{a}/transactions',{'filter':'from'})
        itx=paged(f'/api/v2/addresses/{a}/internal-transactions',{'filter':'from'})
        ins=paged(f'/api/v2/addresses/{a}/token-transfers',{'filter':'to'},limit_pages=10)
        json.dump(dict(tt=tts,tx=txs,itx=itx,tt_in=ins),open(cf,'w'))
    nxt=set()
    for t in tts:
        if (t.get('timestamp') or '')<SINCE: continue
        tok=t.get('token') or {}; tot=t.get('total') or {}
        try: amt=int(tot.get('value') or 0)/10**int(tot.get('decimals') or tok.get('decimals') or 18)
        except: amt=None
        rate=float(tok.get('exchange_rate') or 0)
        to=t['to']['hash'].lower()
        edges.append(dict(chain=chain,from_=a,to=to,to_name=(t['to'].get('name') or ''),to_is_contract=t['to'].get('is_contract'),asset=tok.get('symbol'),token_address=tok.get('address_hash') or tok.get('address'),amount=amt,usd_current=round(amt*rate,2) if amt and rate else '',tx_hash=t.get('transaction_hash') or t.get('tx_hash'),timestamp_utc=t.get('timestamp'),kind='token_transfer'))
        if not t['to'].get('is_contract'): nxt.add(to)
    for t in txs+itx:
        if (t.get('timestamp') or '')<SINCE: continue
        v=int(t.get('value') or 0)/1e18
        if v<=0 or not t.get('to'): continue
        to=t['to']['hash'].lower()
        edges.append(dict(chain=chain,from_=a,to=to,to_name=(t['to'].get('name') or ''),to_is_contract=t['to'].get('is_contract'),asset='ETH' if chain!='avax' else 'AVAX',token_address='native',amount=v,usd_current='',tx_hash=t.get('hash') or t.get('transaction_hash'),timestamp_utc=t.get('timestamp'),kind='native' if t in txs else 'internal'))
        if not t['to'].get('is_contract'): nxt.add(to)
    if dep<MAXD:
        for n in nxt:
            if n in visited or n in BINANCE: continue
            ai=addr_info(n)
            if ai['is_contract']: continue
            if ai['tx_count']>MAXTX: continue
            queue.append((n,dep+1))
for a in visited: addr_info(a)
# token balances
bal={}
for a in visited:
    tb=get(f'/api/v2/addresses/{a}/token-balances') or []
    bal[a]=[dict(symbol=(x.get('token') or {}).get('symbol'),token=(x.get('token') or {}).get('address_hash') or (x.get('token') or {}).get('address'),amount=int(x.get('value') or 0)/10**int((x.get('token') or {}).get('decimals') or 18),rate=float((x.get('token') or {}).get('exchange_rate') or 0)) for x in tb if (x.get('token') or {}).get('type')=='ERC-20']
json.dump(dict(info=info,visited=visited,balances=bal),open(f'out/{chain}_summary.json','w'),indent=1)
with open(f'out/{chain}_edges.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(edges[0].keys()) if edges else ['none']); w.writeheader(); [w.writerow(e) for e in edges]
print('visited',len(visited),'edges',len(edges),file=sys.stderr)
