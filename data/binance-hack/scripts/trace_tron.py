#!/usr/bin/env python3
"""Trace Tron attacker addresses via TronGrid public API (TRC20 + TRX). Writes out/tron_edges.csv, out/tron_addresses.json"""
import json,urllib.request,time,csv,os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rawcache import fetch
API='https://api.trongrid.io'
SINCE=1793304000000
def get(p):
    for i in range(5):
        try:
            j=fetch('trongrid',API+p); time.sleep(0.4); return j
        except Exception as e: err=e; time.sleep(3*(i+1))
    print('FAIL',p,err,file=sys.stderr); return {}
def paged(p):
    out=[];url=p
    for _ in range(15):
        j=get(url); out+=j.get('data',[])
        nxt=j.get('meta',{}).get('links',{}).get('next')
        if not nxt: break
        url=nxt.replace(API,'')
    return out
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
import hashlib
def hex2b58(h):
    b=bytes.fromhex(h); b+=hashlib.sha256(hashlib.sha256(b).digest()).digest()[:4]
    n=int.from_bytes(b,'big'); s=''
    while n: n,r=divmod(n,58); s=B58[r]+s
    return s
os.makedirs('out',exist_ok=True)
seeds=sys.argv[1:]
# Known DEX/router/pool contracts: recorded but never expanded (they are not attacker wallets)
STOP={'TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx','TQqgNg13s2DjvXhW1ky4v6TsR8wZGvb7Y4','TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t','TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR','TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf'}
MAXN=int(os.environ.get('TRON_MAX','45'))
edges=[];addrs={};queue=[(s,0) for s in seeds];seen=set()
while queue:
    a,d=queue.pop(0)
    if a in seen or len(seen)>MAXN: continue
    seen.add(a)
    acc=(get(f'/v1/accounts/{a}').get('data') or [{}])[0]
    trx=acc.get('balance',0)/1e6
    usdt=0
    for t in acc.get('trc20',[]):
        if 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' in t: usdt=int(t['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'])/1e6
    tt=paged(f'/v1/accounts/{a}/transactions/trc20?limit=200&min_timestamp={SINCE}')
    nt=paged(f'/v1/accounts/{a}/transactions?limit=200&min_timestamp={SINCE}')
    is_c=acc.get('type')=='Contract'
    if is_c or a in STOP:
        addrs[a]=dict(address=a,depth=d,trx=trx,usdt=usdt,is_contract=True,expanded=False); print(a,d,'CONTRACT/STOP not expanded',file=sys.stderr); continue
    addrs[a]=dict(address=a,depth=d,is_contract=False,trx=trx,usdt=usdt,n_trc20=len(tt),n_tx=len(nt),created=acc.get('create_time'))
    print(a,d,'TRX',trx,'USDT',usdt,len(tt),len(nt),file=sys.stderr)
    for t in tt:
        amt=int(t['value'])/10**int(t['token_info'].get('decimals',6))
        e=dict(chain='tron',from_=t['from'],to=t['to'],asset=t['token_info'].get('symbol'),amount=amt,tx_hash=t['transaction_id'],timestamp_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(t['block_timestamp']/1000)),kind='trc20')
        edges.append(e)
        if t['from']==a and d<4 and amt>=100000: queue.append((t['to'],d+1))
    for t in nt:
        try:
            c=t['raw_data']['contract'][0]
            if c['type']!='TransferContract': continue
            v=c['parameter']['value']; f=hex2b58(v['owner_address']); to=hex2b58(v['to_address']); amt=v['amount']/1e6
        except Exception: continue
        edges.append(dict(chain='tron',from_=f,to=to,asset='TRX',amount=amt,tx_hash=t['txID'],timestamp_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(t['block_timestamp']/1000)),kind='trx'))
        if f==a and d<4 and amt>=200000: queue.append((to,d+1))
u={(e['from_'],e['to'],e['tx_hash'],e['asset']):e for e in edges}
with open('out/tron_edges.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(edges[0].keys()));w.writeheader();[w.writerow(e) for e in u.values()]
json.dump(addrs,open('out/tron_addresses.json','w'),indent=1)
print('done',len(addrs),len(u),file=sys.stderr)
