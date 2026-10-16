import asyncio,json
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=60&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('for(let i=0;i<12*38;i++)stepOnly(1/12);tick(1/12)')
    print(await pg.evaluate('gameState().ph'), json.dumps(await pg.evaluate('debugWindows().map(w=>w.on)')))
    print(await pg.evaluate('''(()=>{const r=[];const sc=window.__scene;return 0})()'''))
    await pg.screenshot(path='/tmp/w_night.png')
    await b.close()
asyncio.run(main())
