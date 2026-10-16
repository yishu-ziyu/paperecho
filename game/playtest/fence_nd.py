import asyncio, json
from playwright.async_api import async_playwright
ST='/workspace/game-messenger/playtest/morning-stills'
logs=[]; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto('http://localhost:8847/play/index.html?capture&cycle=80&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000)
    await pg.evaluate('window.__ndWait=4')  # only matters once nightDone
    await pg.evaluate('skipTo(1.55)')
    held=set(); saw={}
    for i in range(500):
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      if st['tod'] in (0,1) and st['carry']>=1 and st['targets'] and not st.get('postBeat') and not st.get('nightDone'):
        await pg.evaluate('skipTo(1.55)')
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      if st.get('postBeat')=='fence' and not saw.get('f'):
        saw['f']=i; print('FENCE',i,flush=True); await pg.screenshot(path=f'{ST}/fence-beat.png')
      if st.get('postBeat')=='done' and not saw.get('d'):
        saw['d']=i; print('DONE',i,flush=True)
      if st.get('nightDone') and not saw.get('n'):
        saw['n']=i; print('NIGHTDONE',i, st.get('ph'), flush=True); await pg.screenshot(path=f'{ST}/night-done-lightsout.png')
      if st.get('nights',0)>=1 and saw.get('f') and saw.get('n'):
        print('COMPLETE',i,flush=True); break
      if i%40==0: print('f',i,'dn',st.get('dn'),'pb',st.get('postBeat'),'nd',st.get('nightDone'),flush=True)
    for k in held: await pg.keyboard.up(k)
    await b.close()
  json.dump({'saw':saw,'logs':logs,'pe':sum(1 for l in logs if 'PAGEERROR' in l)}, open('/workspace/game-messenger/playtest/fence-nd-log.json','w'), ensure_ascii=False, indent=1)
  print('RESULT',saw,'PE',sum(1 for l in logs if 'PAGEERROR' in l))
asyncio.run(main())
