import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1280,'height':800})).new_page()
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=48&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('window.__apNoWait=true'); held=set(); shots=0
    for i in range(3000):
      want=set(await pg.evaluate('autoKeys()'))
      if not want: await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.targets.length&&s.night!==1)skipTo(0.8)})()')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate('stepOnly(1/12)')
      bd=await pg.evaluate('debugBeamDist()')
      if any(6<=x<=10 for x in bd) and i%6==0:
        await pg.evaluate('tick(0)'); n=(await pg.evaluate('gameState()'))['night']
        await pg.screenshot(path=f'v6.3-beam/beam-n{n+1}-{bd[0]}m-f{i}.jpg',type='jpeg',quality=90); shots+=1; print(i,n,bd)
        if shots>=4: break
    await b.close()
asyncio.run(main())
