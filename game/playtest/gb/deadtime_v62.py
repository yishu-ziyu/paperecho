# Measure daytime dead time at default cycle (240) on frozen snapshot snap-gb-0547 (port 8862). No screenshots except 2 evidence stills.
import asyncio, json
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/gb'; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':480,'height':300})).new_page()
    pe=[]; pg.on('pageerror', lambda e: pe.append(str(e)))
    await pg.goto('http://127.0.0.1:8862/play/index.html?capture&nosave&glow=1.2')  # default cycle 240
    await pg.wait_for_function('window.ready', timeout=120000)
    await pg.evaluate('window.__apWait=3; window.__ndWait=2')
    held=set(); rows=[]; shots={}
    for i in range(12*400):
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      s=await pg.evaluate('(()=>{const s=gameState();delete s.occ;delete s.np;const h=document.getElementById("hint");s.hint=h.textContent;s.hintOp=h.style.opacity;return s})()')
      s['i']=i; s['t']=round(i/FPS,2); s['keys']=sorted(want); rows.append(s)
      day=s['ph']<1.5 and not s['nightDone'] and not s['postBeat']
      if day and s['carry']>0 and s['hintOp']=='1' and s['t']>6 and s['night'] not in shots:
        shots[s['night']]=i
        b2=await pg.context.new_page() if False else None
        await pg.set_viewport_size({'width':960,'height':600}); await pg.evaluate('tick(0.001)')
        await pg.screenshot(path=f"{OUT}/deadtime-v62-day{s['night']+1}-f{i}.png"); await pg.set_viewport_size({'width':480,'height':300})
      if i%120==0: print(json.dumps(s,ensure_ascii=False)[:260],flush=True)
      if s['nights']>=2 and s['ph']>=1.5: break
    await b.close()
  json.dump({'rows':rows,'pe':pe}, open(OUT+'/deadtime-v62-rows.json','w'), ensure_ascii=False)
  print('END', len(rows), 'pageerrors', len(pe), flush=True)
asyncio.run(main())
