# v6.2 (snap-gb-0635, port 8862) default cycle: why no delivery between PH 0.8 and 1.5? compact log + stills every 3 s
import asyncio, json
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/gb'; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':640,'height':400})).new_page()
    pe=[]; pg.on('pageerror', lambda e: pe.append(str(e))); cons=[]; pg.on('console', lambda m: cons.append(m.text[:120]))
    await pg.goto('http://127.0.0.1:8862/play/index.html?capture&nosave'); await pg.wait_for_function('window.ready',timeout=120000)
    await pg.evaluate('window.__apWait=3; window.__ndWait=2')
    held=set()
    for i in range(12*140):
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      if i%36==0:
        s=await pg.evaluate('(()=>{const s=gameState();return {ph:+s.ph.toFixed(3),tod:s.tod,carry:s.carry,dn:s.dn,found:s.found,tq:s.tq,pb:s.postBeat,tg:s.targets,toast:document.getElementById("toast").innerText.slice(0,40),top:(document.querySelector("#hud")||{}).innerText}})()')
        s['t']=round(i/FPS,1); s['keys']=sorted(want); print(json.dumps(s,ensure_ascii=False).replace('\\n','|'),flush=True)
        if 0.8<=s['ph']<=1.6 and i%72==0: await pg.screenshot(path=f"{OUT}/evidence/v62-dusk-t{int(s['t']):03d}.jpg",type='jpeg',quality=80)
        if s['dn']>=3: break
    print('PE',pe,'CONS',cons[-5:])
    await b.close()
asyncio.run(main())
