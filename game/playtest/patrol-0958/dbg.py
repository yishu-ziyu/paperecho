import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pg.on('console', lambda m: print('C',m.type,m.text[:200]))
    pg.on('pageerror', lambda e: print('PE',e))
    pg.on('requestfailed', lambda r: print('RF',r.url))
    pg.on('response', lambda r: r.status>=400 and print('HTTP',r.status,r.url))
    await pg.goto('http://127.0.0.1:8871/play/index.html?capture&cycle=48&glow=1.2&nosave')
    await asyncio.sleep(25)
    print('ready', await pg.evaluate('window.ready'))
    await b.close()
asyncio.run(main())
