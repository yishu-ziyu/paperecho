"""Short visible check for v5.1: session 晚 label at dawn + sleep nudge after quota."""
import asyncio, json, os, shutil, subprocess
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'
KF=OUT+'/v51-verify'
shutil.rmtree(KF, ignore_errors=True); os.makedirs(KF)
logs=[]; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    # cycle=40 keeps night short so we can hit dawn with unfinished quota in ~1 min
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=40&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000); await pg.evaluate('document.fonts.ready')
    await pg.evaluate('window.__apWait=3')
    held=set(); prev={}; shots=[]
    # run until we either catch dawn with dn<quota on night 3, or finish 3 nights
    for i in range(1500):
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      hud=await pg.evaluate("document.getElementById('hud').innerText")
      tod=await pg.evaluate("document.getElementById('tod').innerText")
      toast=await pg.evaluate("document.getElementById('toast').innerText")
      tag=None
      # dawn unfinished on night index 2
      if st['night']==2 and st['tod']==3 and st['dn']<st['quota'] and 'dawn4' not in shots:
        tag='dawn-unfinished'; shots.append('dawn4')
      if st['night']==2 and st['dn']>=st['quota'] and 'full' not in shots:
        tag='quota-full'; shots.append('full')
      if '睡觉吧' in toast and 'nudge' not in shots:
        tag='sleep-nudge'; shots.append('nudge')
      if st['nights']>=3 and 'done' not in shots:
        tag='finale'; shots.append('done')
      if tag:
        path=f'{KF}/f{i:05d}-{tag}.jpg'
        await pg.screenshot(path=path, type='jpeg', quality=90)
        logs.append(f'{tag} f{i} tod={tod!r} hud={hud!r} toast={toast!r} '+json.dumps(st,ensure_ascii=False)[:280])
        print(logs[-1], flush=True)
      if i%120==0:
        print(f"f{i}", st, flush=True)
      prev=st
      if 'dawn4' in shots and 'nudge' in shots and 'done' in shots: break
      if 'dawn4' in shots and 'full' in shots and i>900 and 'nudge' in shots: break
      # if we got dawn unfinished + later full + nudge, enough
      if len(shots)>=3 and 'dawn4' in shots: break
    for k in held: await pg.keyboard.up(k)
    await b.close()
asyncio.run(main())
json.dump(logs, open(OUT+'/v51-verify-log.json','w'), ensure_ascii=False, indent=1)
print('shots', os.listdir(KF))
print('PAGEERROR', [l for l in logs if 'PAGEERROR' in l])
