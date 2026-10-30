import json,sys,glob
def load(f):
    t=open(f).read(); i=t.find('{'); return json.loads(t[i:t.rfind('}')+1])
seen=set()
for f in sys.argv[1:]:
    d=load(f)
    users={u['id']:u['username'] for u in d.get('includes',{}).get('users',[])}
    for p in d.get('data',[]):
        if p['id'] in seen: continue
        seen.add(p['id'])
        txt=p.get('note_tweet',{}).get('text') or p['text']
        print(p['created_at'],users.get(p['author_id']),p.get('url') or p['id'], p.get('public_metrics',{}).get('like_count'))
        print('  ',txt.replace('\n',' ')[:1500])
    print('META',d.get('meta'))
