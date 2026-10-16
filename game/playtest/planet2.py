import asyncio, json, os, time, sys
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'; FR=OUT+'/planet_frames'; os.makedirs(FR,exist_ok=True); logs=[]
N=int(sys.argv[1]) if len(sys.argv)>1 else 1125
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1280,'height':800})).new_page()
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text} {m.location.get("url","")}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('response',lambda r: r.status>=400 and logs.append(f'HTTP {r.status} {r.url}'))
    await pg.goto('http://localhost:8794/play/?capture&cycle=45&glow=1.2')
    await pg.wait_for_function('window.ready',timeout=40000)
    held=set(); t=time.time(); ms=[]
    for i in range(N):
      want=set(await pg.evaluate('autoKeys()'))
      if 360<=i<400: want=set()
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      if i==360: await pg.keyboard.press('l')
      if i==400: await pg.keyboard.press('l')
      a=time.time(); await pg.evaluate('tick(1/10)'); ms.append(time.time()-a)
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg',type='jpeg',quality=88)
      if i%100==0: logs.append(f'f{i} {await pg.evaluate("gameState()")}')
    logs.append(f'avg frame (step+render) ms {1000*sum(ms)/len(ms):.0f}; total {time.time()-t:.0f}s')
    await b.close()
asyncio.run(main()); json.dump(logs,open(OUT+'/planet-log.json','w'),ensure_ascii=False,indent=1); print('\n'.join(logs))
