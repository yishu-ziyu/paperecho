import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('pageerror',lambda e:print('PE',e))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=60&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    for n in range(3):
      await pg.evaluate("debugKeep();skipTo(2.99);for(let i=0;i<4;i++)stepOnly(1/12)")
    await pg.evaluate("skipTo(1.7);window.__walkHer&&0")
    # stand in front of her house facing it
    await pg.evaluate("""(()=>{const s=window.gameState();return 0})()""")
    await pg.evaluate("debugAtHer(3.2);for(let i=0;i<30;i++)tick(1/12)")
    await pg.screenshot(path='/workspace/game-messenger/playtest/v6-keepsakes-outside.png')
    await b.close()
asyncio.run(main())
