# Grok Bot own capture: frozen snapshot playtest/snap-gb-0547 (game.js md5 1afba1e8), port 8861, own dirs only.
import asyncio, json, os, subprocess, shutil, sys
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/gb'; FR=OUT+'/frames'; KF=OUT+'/keyframes'
os.makedirs(FR,exist_ok=True); os.makedirs(KF,exist_ok=True)
for f in os.listdir(FR): os.remove(f'{FR}/{f}')
logs=[]; FPS=12; CYC=float(sys.argv[1]) if len(sys.argv)>1 else 36; MAXF=int(sys.argv[2]) if len(sys.argv)>2 else 3200
pending={}
def want_kf(i,tag): pending.setdefault(i,[]).append(tag)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto(f'http://127.0.0.1:8861/play/index.html?capture&cycle={CYC}&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=90000); await pg.evaluate('document.fonts.ready')
    await pg.evaluate('window.__apWait=3')
    held=set(); prev={}; i=0; endc=0; ndStart=0
    while i<MAXF:
      want=set(await pg.evaluate('autoKeys()'))
      if not want and i>24:
        r=await pg.evaluate('(()=>{const s=gameState();if((s.tod===0||s.tod===1)&&!s.nightDone&&!s.postBeat){skipTo(1.5);return 1}return 0})()')
        if r: logs.append(f'f{i} skip to night')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=88)
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      lo=await pg.evaluate('(()=>{try{const u=window.__scene?window.__scene.userData:null;return u?{k:u.lightsOut?u.lightsOut.k:null,keep:u.lightsOut&&u.lightsOut.keep?u.lightsOut.keep.length:null}:null}catch(e){return null}})()')
      n=st['night']+1; tags=[]
      if st['dn']!=prev.get('dn') and st['dn']>0: tags.append(f"n{n}-deliver{st['dn']}")
      if st['tod']!=prev.get('tod'): tags.append(f"n{n}-tod{st['tod']}")
      if st['areaOpen'] and not prev.get('areaOpen'): tags.append('n2-area-open')
      if st.get('postBeat')!=prev.get('postBeat') and st.get('postBeat'): tags.append(f"n{n}-beat-{st['postBeat']}")
      if st.get('nightDone') and not prev.get('nightDone'): tags.append(f"n{n}-nightDone-start"); ndStart=i
      if st.get('nightDone'):
        nd=i-ndStart
        if nd in (60,120,168,200): tags.append(f"n{n}-lightsout-{nd//12}s")
      if prev.get('nightDone') and not st.get('nightDone'): tags.append(f"n{n}-nightDone-end")
      for t in tags:
        logs.append(f'f{i} {t} lo={lo} '+json.dumps(st,ensure_ascii=False)[:420])
        print(logs[-1],flush=True)
        shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-{t}.jpg'); want_kf(i+18,t+'+18')
      for t in pending.pop(i,[]): shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-{t}.jpg')
      if i%120==0: logs.append(f'f{i} '+json.dumps(st,ensure_ascii=False)[:420]); print(logs[-1],flush=True)
      prev=st; i+=1
      if st['nights']>=3:
        endc+=1
        if endc>72: break
    for k in held: await pg.keyboard.up(k)
    await b.close()
  json.dump(logs, open(OUT+'/gb61-log.json','w'), ensure_ascii=False, indent=1)
  print('DONE frames',i,'pageerrors',sum('PAGEERROR' in l for l in logs),flush=True)
asyncio.run(main())
