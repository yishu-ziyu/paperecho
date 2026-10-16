import asyncio, json, os, shutil
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'; ST=OUT+'/morning-stills'; os.makedirs(ST,exist_ok=True)
logs=[]; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto('http://localhost:8847/play/index.html?capture&cycle=90&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000)
    await pg.evaluate('document.fonts.ready')
    await pg.evaluate('window.__apWait=3; window.__ndWait=5')
    # jump to night with letters: force state then play
    await pg.evaluate('skipTo(1.55)')
    held=set(); saw={}
    for i in range(700):
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      # if day with carry and targets, skip to night
      if st['tod'] in (0,1) and st['carry']>=1 and st['targets'] and st.get('postBeat') is None and not st.get('nightDone'):
        await pg.evaluate('skipTo(1.55)')
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      pb=st.get('postBeat'); nd=st.get('nightDone')
      if pb=='fence' and not saw.get('fence'):
        saw['fence']=i; await pg.screenshot(path=f'{ST}/fence-beat.png'); logs.append(f'FENCE f{i} '+json.dumps(st,ensure_ascii=False)[:350]); print(logs[-1],flush=True)
      if pb=='done' and not saw.get('done'):
        saw['done']=i; await pg.screenshot(path=f'{ST}/fence-done.png'); logs.append(f'DONE f{i} '+json.dumps(st,ensure_ascii=False)[:350]); print(logs[-1],flush=True)
      if nd and not saw.get('nd'):
        saw['nd']=i; await pg.screenshot(path=f'{ST}/night-done-lightsout.png'); logs.append(f'NIGHTDONE f{i} '+json.dumps(st,ensure_ascii=False)[:350]); print(logs[-1],flush=True)
      if st.get('nights',0)>=1 and saw.get('fence') and saw.get('nd'):
        logs.append(f'COMPLETE f{i}'); break
      if i%50==0: print(f'f{i}',st.get('dn'),st.get('carry'),st.get('tod'),pb,nd,st.get('targets'),flush=True)
    for k in held: await pg.keyboard.up(k)
    # dusk lamp stagger stills (fresh skip, no night wrap side effects as much)
    await pg.evaluate('skipTo(0.85); for(let i=0;i<10;i++)tick(1/12);')
    await pg.screenshot(path=f'{ST}/dusk-lamps-early.png')
    await pg.evaluate('skipTo(1.15); for(let i=0;i<10;i++)tick(1/12);')
    await pg.screenshot(path=f'{ST}/dusk-lamps-mid.png')
    await pg.evaluate('skipTo(1.85); for(let i=0;i<10;i++)tick(1/12);')
    await pg.screenshot(path=f'{ST}/night-windows-lamps.png')
    # courier framing
    await pg.screenshot(path=f'{ST}/courier-framing.png')
    await b.close()
  json.dump({'logs':logs,'saw':saw,'pageerrors':sum(1 for l in logs if 'PAGEERROR' in l)}, open(OUT+'/fence-quick-log.json','w'), ensure_ascii=False, indent=1)
  print('RESULT', saw, 'PAGEERROR', sum(1 for l in logs if 'PAGEERROR' in l))
asyncio.run(main())
