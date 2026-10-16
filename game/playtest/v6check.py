import asyncio,json,sys
from playwright.async_api import async_playwright
CYC=sys.argv[1] if len(sys.argv)>1 else '90'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pg.on('response',lambda r: r.status>=400 and print('HTTP',r.status,r.url))
    pg.on('console',lambda m: m.type in('error','warning') and print('CON',m.text))
    pg.on('pageerror',lambda e: print('PAGEERROR',e))
    await pg.goto(f'http://localhost:8834/play/index.html?capture&cycle={CYC}&nosave&glow=1.2')
    await pg.wait_for_function('window.ready',timeout=60000)
    held=set();FPS=12
    for i in range(int(sys.argv[2]) if len(sys.argv)>2 else 3000):
      want=set(await pg.evaluate('autoKeys()'))
      if not want and i>8: await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.targets.length)skipTo(0.8)})()')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'for(let j=0;j<3;j++)stepOnly({1/FPS})')
      if i%40==0:
        st=await pg.evaluate('gameState()');st.pop('occ',None)
        print(i*3/FPS, json.dumps(st,ensure_ascii=False)); sys.stdout.flush()
        if st.get('nights',0)>=3: break
      if i in (200,):
        print(json.dumps(await pg.evaluate('debugWindows()'),ensure_ascii=False))
    await pg.screenshot(path='/tmp/v5c.png'); await b.close()
asyncio.run(main())
