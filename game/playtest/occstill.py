import asyncio,json
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror',lambda e:print('PE',e))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=60&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    for i,t in enumerate([0,7,14]):
      await pg.evaluate(f'window.__noLift=true;debugBehindTree({t},1.4);for(let i=0;i<10;i++)tick(1/12)')
      await pg.screenshot(path=f'/tmp/occ{i}.png')
      print(json.dumps(await pg.evaluate('({occ:gameState().occ,pp:window.__occ&&__occ.playerPatched()})')))
    # N test with letters in bag
    await pg.evaluate("for(let i=0;i<30;i++)stepOnly(1/12)")
    await pg.keyboard.press('n'); await pg.evaluate("for(let i=0;i<3;i++)stepOnly(1/12)")
    print(json.dumps(await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()'),ensure_ascii=False))
    await b.close()
asyncio.run(main())
