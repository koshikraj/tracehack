#!/usr/bin/env python3
"""Native + major stablecoin balances of attacker addresses on EVM side-chains via public RPCs (Blockscout Arbitrum returned 403).
Writes out/l2_balances.json; raw RPC responses saved under raw/rpc_<chain>/"""
import json,sys,os,time
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rawcache import fetch
RPC={'arbitrum':'https://arbitrum-one-rpc.publicnode.com','optimism':'https://optimism-rpc.publicnode.com','base':'https://base-rpc.publicnode.com',
     'avalanche':'https://avalanche-c-chain-rpc.publicnode.com','polygon':'https://polygon-bor-rpc.publicnode.com','bsc':'https://bsc-rpc.publicnode.com'}
TOK={'arbitrum':{'USDT0':('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',6),'USDC':('0xaf88d065e77c8cC2239327C5EDb3A432268e5831',6),'ARB':('0x912CE59144191C1204E64559FE8253a0e49E6548',18),'WETH':('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',18)},
     'avalanche':{'USDT':('0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',6),'USDC':('0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',6)},
     'polygon':{'USDT0':('0xc2132D05D31c914a87C6611C10748AEb04B58e8F',6),'USDC':('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',6)},
     'optimism':{'USDT':('0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',6),'USDC':('0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',6)},
     'base':{'USDC':('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',6)},'bsc':{'USDT':('0x55d398326f99059fF775485246999027B3197955',18),'USDC':('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',18)}}
def rpc(c,m,p): return fetch(f'rpc_{c}',RPC[c],{'jsonrpc':'2.0','id':1,'method':m,'params':p},ttl=600)['result']
addrs=[l.split()[0] for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]
out={}
for c in RPC:
    for a in addrs:
        try:
            d={'native':int(rpc(c,'eth_getBalance',[a,'latest']),16)/1e18,'nonce':int(rpc(c,'eth_getTransactionCount',[a,'latest']),16)}
            for s,(t,dec) in TOK.get(c,{}).items():
                d[s]=int(rpc(c,'eth_call',[{'to':t,'data':'0x70a08231'+a[2:].lower().rjust(64,'0')},'latest']) or '0x0',16)/10**dec
        except Exception as e: d={'error':str(e)}
        if any(v for k,v in d.items() if k!='error') or 'error' in d: out.setdefault(a,{})[c]=d; print(c,a,d)
out['_checked_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
json.dump(out,open('out/l2_balances.json','w'),indent=1)
