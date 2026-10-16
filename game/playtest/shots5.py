import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror',lambda e:print('PE',e))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=60&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('tick(0.1)'); await pg.screenshot(path='/tmp/s_day.png')
    await pg.evaluate('debugKeep();for(let i=0;i<12*40;i++)stepOnly(1/12);tick(1/12)'); await pg.screenshot(path='/tmp/s_night.png')
    await pg.evaluate('debugShot();for(let i=0;i<14;i++)tick(1/12)'); await pg.screenshot(path='/tmp/s_shot.png')
    await b.close()
asyncio.run(main())
