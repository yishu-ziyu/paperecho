import asyncio,sys,random,io
from PIL import Image
from playwright.async_api import async_playwright
MODE=sys.argv[1];CYC=sys.argv[2] if len(sys.argv)>2 else '36'; random.seed(7)
FENCE=['井边那根绳子','两下。别记成三下','三样东西都在窗台上']
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
    await pg.goto(f'http://localhost:8834/play/index.html?capture&cycle={CYC}&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('window.__apNoWait=true')
    day2=0;dayCarry=set();fin=0;finToasts=set();held=set();N={};stall=0;cur=None;wander=[];prevdn=0;prevnight=0
    for i in range(12000):
      st=await pg.evaluate('(()=>{const s=gameState();return [s.night,s.dn,s.quota,s.carry,s.tod,s.nightDone,s.postBeat]})()')
      n,dn,q,carry,tod,nd,pb=st
      if MODE=='manual' and carry==0 and dn<q and tod==2 and not nd and pb is None:
        if not wander:
          r=random.random()
          if r<0.2: wander=[['w']]*random.randint(60,120)   # far trip
          else: wander=[random.choice([['w'],['w','a'],['w','d'],['w'],['w','a'],[]])]*random.randint(6,24)
        want=set(wander.pop(0))
      else:
        wander=[];want=set(await pg.evaluate('autoKeys()'))
        if not want: await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.targets.length&&s.night!==1)skipTo(0.8)})()')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate('stepOnly(1/12)')
      d=N.setdefault(n,{'shown':[],'lo':None,'last':None,'comp':None,'stale':[],'stall':0})
      if dn>prevdn and n==prevnight: d['last']=i
      if dn>=q and d['comp'] is None and dn>0: d['comp']=i;d['compdeliv']=None
      prevdn=dn if n==prevnight else 0; prevnight=n
      tier,text,ql,hold,op=await pg.evaluate('debugToast()')
      if op!='0' and text and (not d['shown'] or d['shown'][-1][1]!=text):
        d['shown'].append((i,text,tier+'@tod'+str(tod)))
        if text.startswith(('灯一盏','包空了')) and d['lo'] is None: d['lo']=i
        if d['comp'] is not None and tier=='deliv' and i>d['comp']:
          if d['compdeliv'] is None: d['compdeliv']=text
          elif text!=d['compdeliv']: d['stale'].append(text[:20])
      d['q']=q
      if carry>0 and tod==2 and not nd and dn<q:
        d['cw']=d.get('cw',0)+1; d['cwmax']=max(d.get('cwmax',0),d['cw'])
      if dn>d.get('pdn',0): d['cw']=0
      d['pdn']=dn
      if tod in (1,2) and not nd: d['door']=min(d.get('door',99),await pg.evaluate('debugLetterDoor()'))
      if carry==0 and dn<q and tod==2 and not nd: stall+=1
      else: stall=0
      d['stall']=max(d['stall'],stall/12)
      if n==1 and tod==0: day2+=1
      if tod in (0,3) and carry>0 and not nd: dayCarry.add((n,tod,carry))
      if n>=3:
        fin+=1
        if text and op!='0' and fin>2: finToasts.add(text[:12])
        if fin>120: break
      ndv=await pg.evaluate('debugND()')
      if ndv and 9<=ndv[0]<=13.2: d['lampsPush']=max(d.get('lampsPush',0),ndv[5])
      if carry==0 and dn<q and tod==2 and not nd and await pg.evaluate('debugBeams()'): d['beam']=d.get('beam',0)+1
      if ndv and d.get('ndstart') is None: d['ndstart']=i
      if ndv: d['ndend']=i
      if ndv and 9<=ndv[0]<=13.2 and i%3==0:
        await pg.evaluate('tick(0)');im=Image.open(io.BytesIO(await pg.screenshot(type='png'))).convert('RGB').resize((80,50))
        px=list(im.getdata());g=sum(1 for r,gg,bb in px if gg>r+15 and gg>bb)/len(px);d['grass']=max(d.get('grass',0),g)
        if n==0 and abs(ndv[0]-12.9)<0.13: print('FRAME',await pg.evaluate('debugLamps()'))
        if any(abs(ndv[0]-x)<0.13 for x in (9.25,11.0,12.9)): Image.open(io.BytesIO(await pg.screenshot(type='png'))).save(f'/tmp/push-{MODE}-n{n+1}-{ndv[0]:.1f}.png')
        if g>0.85: Image.open(io.BytesIO(await pg.screenshot(type='png'))).save(f'/tmp/grass-n{n+1}-{ndv[0]:.1f}.png')
    ok=True
    for n in range(3):
      d=N[n];lo=d['lo'];sh=d['shown']
      keep=[s for s in sh if '—' in s[1]];fen=[s for s in sh if any(f in s[1] for f in FENCE)]
      after=[s[1][:14] for s in sh if lo is not None and s[0]>lo]
      gap=(lo-d['last'])/12 if lo and d['last'] else None
      xm=[s for s in sh if s[1].startswith('小满')]
      print([(s[0],s[2],s[1][:16]) for s in sh],d["last"],d["comp"]);print(f"NIGHT {n+1}: carryNoDeliverMax {d.get('cwmax',0)/12:.1f}s nudge {any('包还沉着' in x[1] for x in sh)} delivLines {sorted(set(m for x in sh if x[2].startswith('deliv') for m in __import__('re').findall(r'(\S+?)：「',x[1])))} of {d.get('q')} letterDoorMin {d.get('door',99):.1f}m keepsake {len(keep)} fence {len(fen)} afterLO {after} stale {d['stale']} gap {gap} maxEmpty {d['stall']:.1f}s ndStart+{(d['ndstart']-d['last'])/12:.1f}s dawn+{(d['ndend']-d['last'])/12:.1f}s loAtND {(lo-d['ndstart'])/12 if lo else None} maxGrassPush {d.get('grass',0):.2f} nearLampsInPush {d.get('lampsPush',0)} beamFrames {d.get('beam',0)}"+(f" xiaoman_before_lastEnd {bool(xm) and xm[-1][0]<lo}" if n==2 else ''))
      if not keep or not fen or after or False or len(set(m for x in sh if x[2].startswith('deliv') for m in __import__('re').findall(r'(\S+?)：「',x[1])))<d.get('q',0) or d.get('door',99)<4.4 or gap is None or gap>25 or d['stall']>8: ok=False
    print('DAY2_s',day2/12,'DAYCARRY',dayCarry,'FINALE_TOASTS',finToasts)
    print('TRUNC',await pg.evaluate('window.__trunc||[]'))
    print('ERRORS',errs[:3]); print('PASS' if ok and not errs else 'FAIL')
    await b.close()
asyncio.run(main())
