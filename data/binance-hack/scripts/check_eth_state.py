#!/usr/bin/env python3
"""Live ETH balances + USDT/USDC blacklist status via public RPC. Writes out/eth_state.json"""
import json,urllib.request,time,sys
RPC='https://ethereum-rpc.publicnode.com'
def call(m,p):
    r=urllib.request.Request(RPC,data=json.dumps({'jsonrpc':'2.0','id':1,'method':m,'params':p}).encode(),headers={'Content-Type':'application/json','User-Agent':'research'})
    return json.loads(urllib.request.urlopen(r,timeout=30).read())['result']
USDT='0xdAC17F958D2ee523a2206206994597C13D831ec7';USDC='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
def bal(t,a): return int(call('eth_call',[{'to':t,'data':'0x70a08231'+a[2:].lower().rjust(64,'0')},'latest']),16)/1e6
def bl(t,sel,a): return int(call('eth_call',[{'to':t,'data':sel+a[2:].lower().rjust(64,'0')},'latest']),16)==1
addrs=[l.split()[0] for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]
out={}
for a in addrs:
    d=dict(eth=int(call('eth_getBalance',[a,'latest']),16)/1e18,nonce=int(call('eth_getTransactionCount',[a,'latest']),16),code_len=(len(call('eth_getCode',[a,'latest']))-2)//2,
           usdt=bal(USDT,a),usdt_blacklisted=bl(USDT,'0xe47d6060',a),usdc=bal(USDC,a),usdc_blacklisted=bl(USDC,'0xfe575a87',a))
    out[a]=d; print(a,d)
out['_block']=int(call('eth_blockNumber',[]),16); out['_checked_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
json.dump(out,open('out/eth_state.json','w'),indent=1)
