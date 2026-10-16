import json,sys
for M in ['natural','stuck']:
  d=json.load(open(f'run-{M}-8834.json'));R=d['rows'];F=d['fin']
  print('=====',M,'frames',len(R),'pe',d['pe'],'md5',d['md5'])
  prev={}
  for r in R:
    ch=[k for k in ('nights','tod','dn','carry','nightDone','areaOpen','zhouVis','wellVis','arr') if r.get(k)!=prev.get(k)]
    if r['hs']['level']!=prev.get('hs',{}).get('level'): ch.append('hint')
    if len(r['rmVis'])!=len(prev.get('rmVis',[])): ch.append('rmVis')
    if ch: print(f"f{r['f']} t={r['f']/12:.2f}",{k:r.get(k) for k in ('nights','tod','dn','carry','nightDone','areaOpen','zhouVis','wellVis','arr')},'hs',r['hs'],'vis',r['rmVis'],'tg',r['targets'])
    prev=r
  print('hintLog',F['hint']);print('h1',F['h1']);print('h2',F['h2']);print('np',F['np']);print('ks',F['ks']);print('trunc',F['trunc'])
  print('rmKeys',R[-1]['rmKeys'])
