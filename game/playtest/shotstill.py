import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pg.on('pageerror',lambda e:print('PAGEERROR',e))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=36&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    for dd in (1.2,2.5):
      await pg.evaluate('skipTo(2.0)'); await pg.evaluate(f'debugAtHer({dd})')
      for _ in range(36): await pg.evaluate('tick(1/12)')
      await pg.evaluate('debugShot()')
      prev=None;mx=0
      for f in range(60):
        await pg.evaluate('tick(1/12)')
        cp=await pg.evaluate('(()=>{const c=document.querySelector("canvas");return 0})()')
        if f in (8,18,28,34,40,50): await pg.screenshot(path=f'v6.2-shotfix/dd{dd}-f{f:02d}.jpg',type='jpeg',quality=85)
    await b.close()
asyncio.run(main())
