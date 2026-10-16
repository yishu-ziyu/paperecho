import asyncio, json, time, subprocess, sys
from playwright.async_api import async_playwright
ROOT=sys.argv[1]; PORT='8797'; logs=[]
async def main():
  srv=subprocess.Popen(['python3','-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
  try:
   async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':640,'height':400})).new_page()
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('response',lambda r: r.status>=400 and 'favicon' not in r.url and logs.append(f'HTTP {r.status} {r.url}'))
    await pg.goto(f'http://localhost:{PORT}/play/index.html?capture&cycle=30&nosave')
    await pg.wait_for_function('window.ready',timeout=30000)
    held=set()
    for i in range(1200):
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate('tick(1/10)')
      if i%50==0: logs.append(f't={i/10:.0f}s '+json.dumps(await pg.evaluate("gameState()"),ensure_ascii=False)[:300])
    await b.close()
  finally: srv.kill()
try: asyncio.run(main())
except Exception as e: logs.append("EXC "+str(e)[:200])
print('\n'.join(logs))
