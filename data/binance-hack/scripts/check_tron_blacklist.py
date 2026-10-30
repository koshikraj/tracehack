#!/usr/bin/env python3
"""USDT-TRC20 isBlackListed check via TronGrid triggerconstantcontract. Writes out/tron_blacklist.json"""
import json,urllib.request,sys,hashlib,time
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58hex(s):
    n=0
    for c in s: n=n*58+B58.index(c)
    return n.to_bytes(25,'big')[1:21].hex()
USDT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
import os
out=json.load(open('out/tron_blacklist.json')) if os.path.exists('out/tron_blacklist.json') else {}
for a in sys.argv[1:]:
    body=dict(owner_address=a,contract_address=USDT,function_selector='isBlackListed(address)',parameter=b58hex(a).rjust(64,'0'),visible=True)
    r=urllib.request.Request('https://api.trongrid.io/wallet/triggerconstantcontract',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    res=json.loads(urllib.request.urlopen(r,timeout=30).read())
    v=int(res['constant_result'][0],16)==1; out[a]=v; print(a,'blacklisted' if v else 'not blacklisted'); time.sleep(1)
out['_checked_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
json.dump(out,open('out/tron_blacklist.json','w'),indent=1)
