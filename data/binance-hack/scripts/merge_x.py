import json,glob,re
def load(f):
    t=open(f).read(); i=t.find('{'); return json.loads(t[i:t.rfind('}')+1])
out={}
for f in sorted(glob.glob('raw/x_api/*.txt')):
    try: d=load(f)
    except Exception as e: continue
    users={u['id']:u for u in d.get('includes',{}).get('users',[])}
    for p in d.get('data',[]) if isinstance(d.get('data'),list) else ([d['data']] if 'data' in d else []):
        txt=p.get('note_tweet',{}).get('text') or p.get('text')
        if not txt: continue
        u=users.get(p.get('author_id'),{})
        prev=out.get(p['id'])
        if prev and len(prev['text'])>=len(txt): continue
        out[p['id']]=dict(id=p['id'],url=p.get('url') or f"https://x.com/{u.get('username','i')}/status/{p['id']}",author=u.get('username'),author_name=u.get('name'),created_at_utc=p.get('created_at'),text=txt,metrics=p.get('public_metrics'),is_retweet=txt.startswith('RT @'))
L=sorted(out.values(),key=lambda x:x['created_at_utc'] or '')
json.dump(L,open('tweets.json','w'),indent=1,ensure_ascii=False)
print(len(L))
