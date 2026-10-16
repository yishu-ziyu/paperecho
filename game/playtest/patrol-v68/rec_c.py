"""v6.8 patrol: night1 -> dawn -> full night2, no debug shortcuts. Adapted from patrol-v67/rec.py.
usage: python3 rec.py natural|stuck"""
import asyncio, json, os, shutil, sys, hashlib
from playwright.async_api import async_playwright
MODE=sys.argv[1]; PORT=sys.argv[2] if len(sys.argv)>2 else '8834'
OUT='/workspace/game-messenger/playtest/patrol-v68'
FR=f'{OUT}/frames-{MODE}-{PORT}-ce9540e7'; shutil.rmtree(FR,ignore_errors=True); os.makedirs(FR)
FPS=12; CYC=48; MAXF=12*60*8
HOOK='''window.__h1=[];window.__h2=[];{const a=window.onHintLevel1,b=window.onHintLevel2;window.onHintLevel1=id=>{window.__h1.push({id,hs:hintState()});a&&a(id)};window.onHintLevel2=id=>{window.__h2.push({id,hs:hintState()});b&&b(id)};}'''
PROBE='''(()=>{const s=gameState();delete s.occ;const t=document.getElementById('toast');
s.toast=t&&+getComputedStyle(t).opacity>0.05?t.innerText.trim():'';
const at=[...document.body.children].find(e=>/\\d+m$/.test(e.textContent)&&e.style.display==='block');s.arr=at?at.textContent:'';
s.hs=hintState();s.pp=window.__playerPos.toArray().map(v=>+v.toFixed(2));
const rm=window.roofMarkers,z=rm['老周'];s.rmKeys=Object.keys(rm);s.rmVis=Object.keys(rm).filter(k=>rm[k].group.visible);
s.zhouVis=z?z.group.visible:null;s.wellVis=z?z.group.parent.visible:null;
s.rmD={};const V=window.__playerPos.constructor;for(const k in rm){const p=rm[k].group.getWorldPosition(new V());s.rmD[k]=+p.distanceTo(window.__playerPos).toFixed(1);s.rmGlow=s.rmGlow||{};try{s.rmGlow[k]=+rm[k].light.material.userData.u.uGlow.value.toFixed(2)}catch(e){}}
s.ks=[];for(const k in rm){rm[k].house.traverse(o=>{if(o.name==='doorstepKeepsake'){const p=o.getWorldPosition(new V());s.ks.push({house:k,for:o.userData.doorstep,outside:o.userData.outsideFence,vis:o.visible,d:+p.distanceTo(window.__playerPos).toFixed(1)})}})}
return s})()'''
async def main():
  rows=[]; pe=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1280,'height':800})).new_page()
    pg.on('pageerror', lambda e: pe.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/play/index.html?capture&cycle={CYC}&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=90000); await pg.evaluate('document.fonts.ready')
    await pg.evaluate(HOOK)
    held=set(); i=0; stuck=None; n2end=None
    while i<MAXF:
      st=await pg.evaluate(PROBE)
      want=set(await pg.evaluate('autoKeys()'))
      n2=st['nights']>=1 and st['tod']>=1
      if MODE=='stuck' and n2 and stuck is None and st['carry']>0 and st['hs']['house'] and not st['nightDone']: stuck=i
      if stuck is not None and i-stuck<FPS*10: want=set()
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      if MODE=='natural' or (stuck is not None and i-stuck<FPS*11):
        await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=90)
      st=await pg.evaluate(PROBE); st['f']=i; st['stuckF']=stuck; rows.append(st)
      if i%120==0: print(i,st['nights'],st['tod'],st['dn'],st['carry'],st['nightDone'],st['toast'][:20],flush=True)
      if st['nights']>=2 and n2end is None: n2end=i
      if n2end is not None and i-n2end>FPS*20: break
      if MODE=='stuck' and stuck is not None and i-stuck>FPS*12: break
      i+=1
    fin=await pg.evaluate('({sub:window.subtitleLog,hint:window.hintLog,h1:window.__h1,h2:window.__h2,np:window.nightProgress.deliveries,ks:Object.fromEntries(window.nightProgress.deliveries.map(d=>[d.recipient,window.nightProgress.keepsakeFor(d.recipient)])),trunc:window.__trunc||[]})')
    await b.close()
  json.dump({'rows':rows,'fin':fin,'pe':pe,'md5':hashlib.md5(open('/workspace/game-messenger/repro/play/game.js','rb').read()).hexdigest()},open(f'{OUT}/run-{MODE}-{PORT}-ce9540e7.json','w'),ensure_ascii=False)
  print('END',i,pe,flush=True)
asyncio.run(main())
