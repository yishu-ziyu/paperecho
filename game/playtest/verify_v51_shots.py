"""Surgical shots: force dawn+4/5 HUD, and sleep-nudge toast."""
import asyncio, json, os, shutil
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/v51-verify'
os.makedirs(OUT, exist_ok=True)
logs=[]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=240&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000)
    await pg.evaluate('document.fonts.ready')
    # Force mid night-3 with 4/5 and PH in dawn band (~2.7)
    info=await pg.evaluate('''() => {
      // advance two nightEnds via skip
      for (let n=0;n<2;n++){ window.tick(0.05); }
      // poke internals via a small harness if exposed; else simulate by ticking with N
      return !!window.gameState;
    }''')
    # Use N twice to reach night 3 morning, then set PH/dn via eval of closed-over vars — not exposed.
    # Instead: run autopilot with huge cycle until night 2, then force time with skipNight + tick,
    # then use debug by injecting into step via modifying tOff... we need access to PH.
    # Expose a tiny debug setter.
    await pg.evaluate('''() => {
      // monkey-patch: after ready, re-bind by wrapping tick
      const g = window;
      // Find PH via gameState().ph — we can advance time by ticking
    }''')
    # Practical path: cycle very short, deliver slowly by disabling auto N, capture dawn
    await b.close()

    # Fresh page, cycle=28, __apWait=999 so it won't sleep; run until dawn on night 3 with dn<5
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=28&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000)
    await pg.evaluate('document.fonts.ready')
    await pg.evaluate('window.__apWait=999')  # never auto-sleep
    held=set(); got_dawn=False; got_nudge=False
    for i in range(1400):
      want=set(await pg.evaluate('autoKeys()'))
      # strip N just in case
      want = {k for k in want if k!='n'}
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/12})')
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      hud=await pg.evaluate("document.getElementById('hud').innerText")
      tod=await pg.evaluate("document.getElementById('tod').innerText")
      toast=await pg.evaluate("document.getElementById('toast').innerText")
      if (not got_dawn) and st['night']==2 and st['tod']==3 and st['dn']<st['quota']:
        await pg.screenshot(path=f'{OUT}/dawn-unfinished.jpg', type='jpeg', quality=92)
        logs.append({'tag':'dawn-unfinished','hud':hud,'tod':tod,'toast':toast,'st':st})
        print('DAWN', hud.replace('\\n',' | '), tod, flush=True)
        got_dawn=True
      if (not got_nudge) and ('睡觉吧' in toast or 'Press N' in toast):
        await pg.screenshot(path=f'{OUT}/sleep-nudge.jpg', type='jpeg', quality=92)
        logs.append({'tag':'sleep-nudge','hud':hud,'tod':tod,'toast':toast,'st':st})
        print('NUDGE', toast, flush=True)
        got_nudge=True
      # after night2 quota full, wait for nudge (apWait high so we stay)
      if st['night']==1 and st['dn']>=st['quota'] and st.get('ph',0)>0:
        pass
      if i%150==0: print('f',i, 'n',st['night'],'dn',st['dn'],'/',st['quota'],'tod',st['tod'],'ph',round(st['ph'],2), flush=True)
      if got_dawn and got_nudge: break
      # if night3 finished without dawn unfinished (unlikely at cycle=28), still try nudge on n2
      if st['nights']>=3 and got_nudge: break
    for k in held: await pg.keyboard.up(k)
    # if nudge missed, force toast by waiting on a night with full quota
    if not got_nudge:
      # reload and jump: complete night1 fast then idle
      pass
    await b.close()
  json.dump(logs, open('/workspace/game-messenger/playtest/v51-verify-log.json','w'), ensure_ascii=False, indent=1)
  print('done', [x.get('tag') if isinstance(x,dict) else x for x in logs])
asyncio.run(main())
