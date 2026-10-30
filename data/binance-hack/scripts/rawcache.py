"""Shared fetch helper: every raw API response is saved to raw/<source>/<sha1>.json with an index line
(url, fetched_utc, file) in raw/<source>/index.jsonl. Responses younger than CACHE_TTL seconds (default 7200) are reused."""
import json,os,time,hashlib,urllib.request
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','raw')
def fetch(source,url,body=None,timeout=40,ttl=None):
    ttl=float(os.environ.get('CACHE_TTL','7200')) if ttl is None else ttl
    d=os.path.join(ROOT,source); os.makedirs(d,exist_ok=True)
    key=hashlib.sha1((url+(json.dumps(body,sort_keys=True) if body else '')).encode()).hexdigest()
    f=os.path.join(d,key+'.json')
    if os.path.exists(f) and time.time()-os.path.getmtime(f)<ttl:
        return json.load(open(f))['response']
    h={'User-Agent':'Mozilla/5.0 research','accept':'application/json'}
    if body is not None: h['Content-Type']='application/json'
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=h)
    with urllib.request.urlopen(req,timeout=timeout) as r: resp=json.loads(r.read())
    ts=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    json.dump({'url':url,'body':body,'fetched_utc':ts,'response':resp},open(f,'w'))
    with open(os.path.join(d,'index.jsonl'),'a') as ix: ix.write(json.dumps({'url':url,'body':body,'fetched_utc':ts,'file':key+'.json'})+'\n')
    return resp
