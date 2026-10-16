import asyncio, json, os, shutil
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'
ST=OUT+'/morning-stills'; os.makedirs(ST, exist_ok=True)
FR=OUT+'/fence_audit_frames'; shutil.rmtree(FR, ignore_errors=True); os.makedirs(FR)
logs=[]; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    # default-ish pacing
    await pg.goto('http://localhost:8847/play/index.html?capture&cycle=120&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000)
    await pg.evaluate('document.fonts.ready')
    await pg.evaluate('window.__apWait=4; window.__ndWait=6')
    # --- item 6: L toggle ---
    zh=await pg.evaluate('()=>{const h=document.getElementById("hud").innerText;const t=document.getElementById("toast");return {hud:h,lang:document.documentElement.lang||"?",hint:document.getElementById("hint").innerText}}')
    await pg.keyboard.press('l'); await pg.evaluate('tick(0.1)')
    en=await pg.evaluate('()=>({hud:document.getElementById("hud").innerText,hint:document.getElementById("hint").innerText})')
    await pg.keyboard.press('l'); await pg.evaluate('tick(0.1)')
    zh2=await pg.evaluate('()=>({hud:document.getElementById("hud").innerText,hint:document.getElementById("hint").innerText})')
    logs.append('LANG_AUDIT '+json.dumps({'zh0':zh,'en':en,'zh2':zh2},ensure_ascii=False)[:800])
    await pg.screenshot(path=f'{ST}/lang-zh.png')
    await pg.keyboard.press('l'); await pg.evaluate('tick(0.1)')
    await pg.screenshot(path=f'{ST}/lang-en.png')
    await pg.keyboard.press('l'); await pg.evaluate('tick(0.1)')
    # --- TOD stills day/dusk/night ---
    for name,ph in [('day',0.2),('dusk',1.0),('night',1.8)]:
      await pg.evaluate(f'skipTo({ph}); tick(0.2);')
      # settle a bit
      for _ in range(8): await pg.evaluate(f'tick({1/FPS})')
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      await pg.screenshot(path=f'{ST}/tod-{name}.png')
      logs.append(f'TOD {name} '+json.dumps(st,ensure_ascii=False)[:300])
    # --- play through night1 to fence beat (cycle=120, faster) ---
    await pg.evaluate('skipTo(0.1);')
    held=set(); prev={}; saw_fence=False; saw_nightDone=False; i=0
    while i<900:
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      if i%6==0: await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=80)
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      if st.get('postBeat')=='fence' and not saw_fence:
        saw_fence=True; logs.append(f'f{i} FENCE '+json.dumps(st,ensure_ascii=False)[:300])
        await pg.screenshot(path=f'{ST}/fence-beat.png')
      if st.get('postBeat')=='done' and saw_fence and 'fence-done' not in str(logs[-3:]):
        logs.append(f'f{i} FENCE_DONE '+json.dumps(st,ensure_ascii=False)[:300])
        await pg.screenshot(path=f'{ST}/fence-done.png')
      if st.get('nightDone') and not saw_nightDone:
        saw_nightDone=True; logs.append(f'f{i} NIGHTDONE '+json.dumps(st,ensure_ascii=False)[:300])
        await pg.screenshot(path=f'{ST}/night-done-lightsout.png')
      if st.get('nights',0)>=1 and saw_fence and saw_nightDone:
        logs.append(f'f{i} night1 complete '+json.dumps(st,ensure_ascii=False)[:300])
        break
      if i%60==0: logs.append(f'f{i} '+json.dumps(st,ensure_ascii=False)[:280]); print(logs[-1],flush=True)
      prev=st; i+=1
    for k in held: await pg.keyboard.up(k)
    # camera/courier still at night: stand near a house
    await pg.evaluate('skipTo(1.7); tick(0.3);')
    await pg.screenshot(path=f'{ST}/courier-night.png')
    # lamp stagger check: force dusk mid
    await pg.evaluate('skipTo(1.05); for(let i=0;i<12;i++) tick(1/12);')
    await pg.screenshot(path=f'{ST}/dusk-lamps.png')
    await pg.evaluate('skipTo(1.9); for(let i=0;i<12;i++) tick(1/12);')
    await pg.screenshot(path=f'{ST}/night-windows-lamps.png')
    await b.close()
  json.dump(logs, open(OUT+'/fence-audit-log.json','w'), ensure_ascii=False, indent=1)
  print('done', 'fence',saw_fence, 'nightDone',saw_nightDone, 'PAGEERROR', sum(1 for l in logs if 'PAGEERROR' in l))
asyncio.run(main())
