# Night-2 clue trial: a bot that reads the envelope clue (#clue), matches it to a roof marker it can see, and walks there with real key presses.
# It never reads the locked target / state.targets. If there is no clue it wanders, and follows the on-screen arrow once it appears (hint level 2).
import asyncio,sys,json,math,random
from playwright.async_api import async_playwright
CYC=sys.argv[1] if len(sys.argv)>1 else '48';IDLE=len(sys.argv)>2 and sys.argv[2]=='idle'; NOCLUE=len(sys.argv)>2 and sys.argv[2]=='noclue'; random.seed(3)
CLUES={"小满":"给数星星的那个孩子","阿汀":"给折了快一百只船的人","米婆婆":"给花都叫秋生的那家"}
BOT=r"""
window.clueBot=(st)=>{const V=window.debugView();const v=a=>({x:a[0],y:a[1],z:a[2]});
 const p=v(V.p),f=v(V.f);const n=Math.hypot(p.x,p.y,p.z);const up={x:p.x/n,y:p.y/n,z:p.z/n};
 const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const keysTo=(g)=>{const gn=Math.hypot(g.x,g.y,g.z);const gd={x:g.x/gn,y:g.y/gn,z:g.z/gn};const k=dot(gd,up);const t={x:gd.x-up.x*k,y:gd.y-up.y*k,z:gd.z-up.z*k};const cr=cross(f,up);const gx=dot(t,cr)/(Math.hypot(cr.x,cr.y,cr.z)||1),gz=dot(t,f);let best=[],bs=-9;for(const [kk,x,z] of [[['w'],0,1],[['w','d'],.707,.707],[['d'],1,0],[['s','d'],.707,-.707],[['s'],0,-1],[['s','a'],-.707,-.707],[['a'],-1,0],[['w','a'],-.707,.707]]){const s=x*gx+z*gz;if(s>bs){bs=s;best=kk;}}return best;};
 const ang=(a)=>{const an=Math.hypot(a.x,a.y,a.z);return Math.acos(Math.max(-1,Math.min(1,dot(a,up)/an)));};
 if(st.carry===0){const L=window.debugLetters().map(v);if(!L.length)return {k:['w'],why:'search'};L.sort((a,b)=>ang(a)-ang(b));return {k:keysTo(L[0]),why:'letter'};}
 const clue=(document.getElementById('clue')||{}).textContent||'';
 const kind=/星/.test(clue)?'telescope':/船/.test(clue)?'boatString':/花/.test(clue)?'lantern':/井/.test(clue)?'wellLamp':/亲爱/.test(clue)?'envelopePole':null;
 if(kind){const ms=Object.values(window.roofMarkers).filter(m=>m.kind===kind&&m.group.visible&&!m.delivered);if(ms.length){const w=ms[0].light.getWorldPosition(new ms[0].light.position.constructor());return {k:keysTo(w),why:'clue:'+kind};}}
 const ar=[...document.querySelectorAll('body>div')].find(d=>d.style.display==='block'&&/rotate\(/.test(d.style.transform)&&d.offsetWidth<60);
 if(ar){const a=parseFloat(ar.style.transform.match(/rotate\(([-\d.e]+)rad/)[1])-Math.PI/2;const sx=Math.cos(a),sy=Math.sin(a);const fwd=-sy,rt=sx;let best=[],bs=-9;for(const [kk,x,z] of [[['w'],0,1],[['w','d'],.707,.707],[['d'],1,0],[['w','a'],-.707,.707],[['a'],-1,0],[['s'],0,-1]]){const s=x*rt+z*fwd;if(s>bs){bs=s;best=kk;}}return {k:best,why:'arrow'};}
 return {k:null,why:'wander'};};
"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':800,'height':500})).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    import os
    NPGOOD=os.environ.get('NPGOOD')
    if NPGOOD:
      _np=open(NPGOOD).read()
      async def _npr(route): await route.fulfill(status=200,content_type='application/javascript',body=_np)
      await pg.route('**/play/nightProgress.js',_npr)
    if False:
      async def serve(route): await route.fulfill(status=200,content_type='application/json',body=json.dumps(CLUES,ensure_ascii=False))
      await pg.route('**/copy/night2-clues.json',serve)
    await pg.goto(f'http://localhost:8834/play/index.html?capture&cycle={CYC}&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('window.__apNoWait=true'); await pg.evaluate(BOT+';0')
    held=set();prevdn=0;lastc=0;carryAt=0;dels=[];why={};wander=[];pick=None;FPS=12;hooks=[]
    await pg.evaluate('window.onHintLevel1=(id)=>{(window.__h1=window.__h1||[]).push(id)}')
    for i in range(9000):
      st=await pg.evaluate('(()=>{const s=gameState();return {night:s.night,dn:s.dn,q:s.quota,carry:s.carry,tod:s.tod,nd:s.nightDone}})()')
      if st['night']>=2: break
      if st['night']==1 and st['tod']==2 and not st['nd'] and st['dn']<st['q']:
        if st['carry']>0 and lastc==0: carryAt=i
        lastc=st['carry']
        r=await pg.evaluate('clueBot(%s)'%json.dumps(st))
        if IDLE and st['carry']>0 and i-carryAt<9*12 and r['why']!='arrow': r={'k':None,'why':'idle'}
        if r['k'] is None:
          if not wander: wander=[random.choice([['w'],['w','a'],['w','d']])]*random.randint(8,30)
          want=set(wander.pop(0))
        else: want=set(r['k']);wander=[]
        why[r['why'].split(':')[0]]=why.get(r['why'].split(':')[0],0)+1
      else:
        want=set(await pg.evaluate('autoKeys()'))
        if not want: await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.targets.length&&s.night!==1)skipTo(0.8)})()')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate('stepOnly(1/12)')
      if st['night']==1 and st['dn']>prevdn:
        hs=await pg.evaluate('hintState()'); dels.append((i,await pg.evaluate('performance.now()'),hs))
      prevdn=st['dn'] if st['night']==1 else 0
    T=lambda: None
    log=await pg.evaluate('window.subtitleLog.filter(x=>x.night===1)')
    hl=await pg.evaluate('window.hintLog'); h1=await pg.evaluate('window.__h1||[]')
    clues=await pg.evaluate('night2Clues()')
    print('CLUES',bool(clues),'botModes',why)
    print('HINTLOG',hl,'onHintLevel1 calls',h1)
    print('DELIVERIES(frame)',[d[0] for d in dels])
    # per-delivery: did level 2 fire for that house before it was delivered?
    # subtitle checks
    bad=[];ex=[];prev=None
    for x in log:
      dur=(x['end'] or 0)-x['start']; need=max(1.5,len(x['text'])/7+0.5)
      if x['end'] is not None and dur<need-0.15: bad.append(('short',x['text'][:10],round(dur,2),round(need,2)))
      if prev:
        g=x['start']-(prev['end'] if prev['end'] is not None else 1e9)
        if g< -0.01: bad.append(('overlap',x['text'][:10]))
        if g>=8-0.01: ex.append([x])
        elif g>=1.5-0.05 and ex: ex[-1].append(x)
        else: bad.append(('gap',round(g,2),x['text'][:10])); ex[-1].append(x) if ex else ex.append([x])
      else: ex.append([x])
      prev=x
    for e in ex:
      if len(e)>3: bad.append(('exchange>3',len(e)))
    for x in log: print(' SUB %6.2f-%6s %-6s %s'%(x['start'],x['end'],x['tier'],x['text'][:22]))
    gaps=[round(log[k]['start']-log[k-1]['end'],2) for k in range(1,len(log)) if log[k-1]['end'] is not None]
    import re
    replies=[m for x in log if x['tier']=='deliv' for m in re.findall(r'(\S+?)：「',x['text'])]
    print('EXCHANGES',[len(e) for e in ex],'GAPS',gaps)
    print('REPLIES',replies,'BAD',bad,'ERRORS',errs[:3])
    json.dump({'subs':log,'hint':hl,'dels':[d[0] for d in dels],'modes':why},open('/tmp/n2clue.json','w'),ensure_ascii=False)
asyncio.run(main())
