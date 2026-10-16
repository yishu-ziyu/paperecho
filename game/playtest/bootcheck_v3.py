import asyncio, json, time, sys
from playwright.async_api import async_playwright
PORT='8802'; logs=[]; OUT='/workspace/game-messenger/playtest'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':640,'height':400})).new_page()
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('response',lambda r: r.status>=400 and 'favicon' not in r.url and logs.append(f'HTTP {r.status} {r.url}'))
    t0=time.time()
    await pg.goto(f'http://localhost:{PORT}/play/index.html?capture&cycle=30&nosave')
    try:
      await pg.wait_for_function('window.ready',timeout=45000)
      logs.append(f'BOOT_OK load={time.time()-t0:.1f}s')
      st=await pg.evaluate('gameState()')
      logs.append('state '+json.dumps(st,ensure_ascii=False)[:500])
      await pg.screenshot(path=OUT+'/v3-boot.png')
    except Exception as e:
      logs.append(f'BOOT_FAIL {e}')
      for i in range(4):
        await pg.screenshot(path=f'{OUT}/v3-boot-fail-{i}.png')
        await asyncio.sleep(5)
    await b.close()
asyncio.run(main())
open(OUT+'/v3-boot-log.json','w').write(json.dumps(logs,ensure_ascii=False,indent=1))
print('\n'.join(logs))
