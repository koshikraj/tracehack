#!/usr/bin/env python3
"""Trace BTC from the attacker staging address via mempool.space public API. Writes out/btc_edges.csv, out/btc_addresses.json"""
import json,urllib.request,time,csv,os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rawcache import fetch
API='https://mempool.space/api'
def get(p):
    for i in range(5):
        try:
            j=fetch('mempool_space',API+p); time.sleep(0.3); return j
        except Exception as e: err=e; time.sleep(2*(i+1))
    print('FAIL',p,err,file=sys.stderr)
def txs(a):
    out=get(f'/address/{a}/txs') or []
    while out and len(out)%25==0 and len(out)<500:
        more=get(f'/address/{a}/txs/chain/{out[-1]["txid"]}') or []
        if not more: break
        out+=more
    return out
os.makedirs('out',exist_ok=True)
seeds=sys.argv[1:] or ['bc1q0mtc2f5agpkvlq6hhahmfr3hlr55kyfjhl2mnm']
SINCE=1793304000  # 2026-10-29 18:00 UTC
edges=[];addrs={};queue=[(s,0) for s in seeds];seen=set()
while queue:
    a,d=queue.pop(0)
    if a in seen or len(seen)>120: continue
    seen.add(a)
    info=get(f'/address/{a}'); cs=info['chain_stats']; ms=info['mempool_stats']
    bal=(cs['funded_txo_sum']-cs['spent_txo_sum']+ms['funded_txo_sum']-ms['spent_txo_sum'])/1e8
    addrs[a]=dict(address=a,depth=d,balance_btc=bal,tx_count=cs['tx_count'])
    print(a,d,bal,cs['tx_count'],file=sys.stderr)
    for t in txs(a):
        ts=t['status'].get('block_time') or 0
        if ts and ts<SINCE: continue
        ins=[v['prevout']['scriptpubkey_address'] for v in t['vin'] if v.get('prevout')]
        if a in ins:  # outgoing
            for o in t['vout']:
                oa=o.get('scriptpubkey_address')
                if not oa or oa in ins: continue
                edges.append(dict(chain='btc',from_=a,to=oa,asset='BTC',amount=o['value']/1e8,tx_hash=t['txid'],timestamp_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(ts)) if ts else 'mempool',block=t['status'].get('block_height'),kind='out'))
                if d<10 and o['value']>=1e8: queue.append((oa,d+1))
        else:
            for src in set(ins):
                amt=sum(o['value'] for o in t['vout'] if o.get('scriptpubkey_address')==a)/1e8
                edges.append(dict(chain='btc',from_=src,to=a,asset='BTC',amount=amt,tx_hash=t['txid'],timestamp_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(ts)) if ts else 'mempool',block=t['status'].get('block_height'),kind='in'))
# dedupe
u={(e['from_'],e['to'],e['tx_hash']):e for e in edges}
with open('out/btc_edges.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(edges[0].keys()));w.writeheader();[w.writerow(e) for e in u.values()]
json.dump(addrs,open('out/btc_addresses.json','w'),indent=1)
print('done',len(addrs),len(u),file=sys.stderr)
