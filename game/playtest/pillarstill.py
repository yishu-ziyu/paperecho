import asyncio,json
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pg.on('pageerror',lambda e:print('PE',e))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=52&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    held=set()
    for i in range(3000):
      want=set(await pg.evaluate('autoKeys()'))
      if not want: await pg.evaluate('(()=>{const s=gameState();if(s.tod<2&&!s.nightDone)skipTo(1.5)})()')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate('stepOnly(1/12)')
      st=await pg.evaluate('gameState()')
      if len(st['targets'])==1 and st['tod']==2:
        for k in held: await pg.keyboard.up(k)
        await pg.evaluate('debugAtHer(7,true);for(let i=0;i<14;i++)tick(1/12)')
        await pg.screenshot(path='/workspace/game-messenger/playtest/v6.1-verify/pillar-last-letter.png'); print(st['targets'],i); break
    await b.close()
asyncio.run(main())
