import asyncio,json
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':800,'height':500})).new_page()
    pg.on('pageerror',lambda e:print('PAGEERROR',e))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=36&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    held=set();prev=None;lastToast=''
    for i in range(9000):
      want=set(await pg.evaluate('autoKeys()'))
      if not want: await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.targets.length)skipTo(0.8)})()')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate('stepOnly(1/12)')
      st=await pg.evaluate('(()=>{const s=gameState();return [s.night,s.postBeat,s.nightDone,s.dn,document.getElementById("toast").innerText]})()')
      if st[4]!=lastToast and st[4].strip(): lastToast=st[4]; print(i, st[0], 'TOAST', st[4][:60].replace('\n',' '))
      if st[:4]!=prev: print(i, st[:4]); prev=st[:4]
      if st[0]>=3: break
    await b.close()
asyncio.run(main())
