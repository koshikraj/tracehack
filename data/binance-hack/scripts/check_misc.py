#!/usr/bin/env python3
"""Live balances for XRP, Solana, Tron stash addresses via public RPCs. Writes out/misc_balances.json"""
import json,urllib.request,time
def post(url,body):
    r=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','User-Agent':'research'})
    return json.loads(urllib.request.urlopen(r,timeout=40).read())
def get(url): return json.loads(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'research'}),timeout=40).read())
out={}
x=post('https://xrplcluster.com/',{'method':'account_info','params':[{'account':'rK21t6nGLy4MNDqhvy3pGwcLFy25qgfzMx','ledger_index':'validated'}]})
out['rK21t6nGLy4MNDqhvy3pGwcLFy25qgfzMx']={'chain':'xrp','XRP':int(x['result']['account_data']['Balance'])/1e6,'raw':x['result'].get('account_data')}
xt=post('https://xrplcluster.com/',{'method':'account_tx','params':[{'account':'rK21t6nGLy4MNDqhvy3pGwcLFy25qgfzMx','limit':50}]})
out['rK21t6nGLy4MNDqhvy3pGwcLFy25qgfzMx']['txs']=[{'hash':t['tx']['hash'] if 'tx' in t else t.get('hash'),'type':(t.get('tx') or t.get('tx_json',{})).get('TransactionType'),'from':(t.get('tx') or t.get('tx_json',{})).get('Account'),'to':(t.get('tx') or t.get('tx_json',{})).get('Destination'),'amount':(t.get('tx') or t.get('tx_json',{})).get('Amount') or (t.get('meta',{}).get('delivered_amount')),'date':(t.get('tx') or t.get('tx_json',{})).get('date')} for t in xt['result'].get('transactions',[])]
for a in ['AffzFDKZbyMiU11zmVBoAqD25ugpr7xoWWyRyGigBEaU']:
    b=post('https://api.mainnet-beta.solana.com',{'jsonrpc':'2.0','id':1,'method':'getBalance','params':[a]})
    s=post('https://api.mainnet-beta.solana.com',{'jsonrpc':'2.0','id':1,'method':'getSignaturesForAddress','params':[a,{'limit':50}]})
    out[a]={'chain':'solana','SOL':b['result']['value']/1e9,'signatures':s.get('result')}
for a in ['TSpe5HC3PRD2svJcr1YoGszhHk2mtkyZ8A','TRBdWqHnDVSZCVGfgHdKFLQPirQcA2PRki','TG5iBMQPrDzJJAUM8GMVBf1hRaJ1wvzsGi','TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx']:
    d=(get(f'https://api.trongrid.io/v1/accounts/{a}').get('data') or [{}])[0]; time.sleep(1)
    usdt=sum(int(t['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t']) for t in d.get('trc20',[]) if 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' in t)/1e6
    out[a]={'chain':'tron','TRX':d.get('balance',0)/1e6,'USDT':usdt}
out['_checked_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
json.dump(out,open('out/misc_balances.json','w'),indent=1)
for k,v in out.items():
    if isinstance(v,dict): print(k,{kk:vv for kk,vv in v.items() if kk not in('raw','txs','signatures')}, 'ntx',len(v.get('txs') or v.get('signatures') or []))
