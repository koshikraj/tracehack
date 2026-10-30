#!/usr/bin/env python3
"""Probe freeze/blacklist getters on non-USDT/USDC issuer tokens for attacker addresses (Ethereum, publicnode RPC).
Tries several common getter names; a revert means the getter does not exist (not 'not frozen').
Usage: python3 scripts/check_freeze_tokens.py  -> out/token_freeze_status.json, raw/rpc_ethereum/freeze_probe.json"""
import json,urllib.request,hashlib,time,sys
from Crypto.Hash import keccak as _k
def keccak(text): h=_k.new(digest_bits=256); h.update(text.encode()); return h.digest()
RPC='https://ethereum-rpc.publicnode.com'
TOK={'XAUT':'0x68749665FF8D2d112Fa859AA293F07A622782F38','PAXG':'0x45804880De22913dAFE09f4980848ECE6EcbAf78','USD1':'0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d','FDUSD':'0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409','RLUSD':'0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD','WBETH':'0xa2E3356610840701BDf5611a53974510Ae27E2e1','WLFI':'0xdA5e1988097297dCdc1f90D4dFE7909e847CBeF6','USDT':'0xdAC17F958D2ee523a2206206994597C13D831ec7','USDC':'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'}
FN=['isBlacklisted(address)','isBlackListed(address)','isBlocked(address)','isFrozen(address)','blacklisted(address)','frozen(address)','isBanned(address)','isDenied(address)','isRestricted(address)','isSanctioned(address)','blacklist(address)','isBlacklist(address)']
ADDRS=sys.argv[1:] or ['0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c','0x7f9DC988B46336aD536828fAD50fa8fA1E5415E3','0xE7024aB80143b1EF843EFE6a58368696Cb87958d','0x28C6c06298d514Db089934071355E5743bf21d60']
def call(to,data):
    b=json.dumps({'jsonrpc':'2.0','id':1,'method':'eth_call','params':[{'to':to,'data':data},'latest']}).encode()
    r=json.load(urllib.request.urlopen(urllib.request.Request(RPC,b,{'Content-Type':'application/json','User-Agent':'Mozilla/5.0'}),timeout=20)); time.sleep(0.15); return r
raw=[];out={}
for a in ADDRS:
    out[a]={}
    for sym,t in TOK.items():
        res=None
        for f in FN:
            d='0x'+keccak(text=f)[:4].hex()+a[2:].lower().rjust(64,'0')
            r=call(t,d); raw.append(dict(addr=a,token=sym,fn=f,resp=r))
            v=r.get('result')
            if v and v!='0x' and len(v)>=66: res=dict(fn=f,frozen=int(v,16)==1); break
        out[a][sym]=res or 'no-known-getter'
        print(a[:10],sym,out[a][sym])
out['_checked_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
json.dump(out,open('out/token_freeze_status.json','w'),indent=1); json.dump(raw,open('raw/rpc_ethereum/freeze_probe.json','w'))
