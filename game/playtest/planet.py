import asyncio, json
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'; logs=[]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    c=await b.new_context(viewport={'width':1280,'height':800},record_video_dir=OUT+'/raw_planet',record_video_size={'width':1280,'height':800})
    pg=await c.new_page()
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto('http://localhost:8794/play/?cycle=60&glow=1.2')
    await pg.wait_for_function('window.ready',timeout=60000)
    held=set(); t0=asyncio.get_event_loop().time(); shots=0; lastfps=0
    while asyncio.get_event_loop().time()-t0<80:
      el=asyncio.get_event_loop().time()-t0
      if 38<el<41: want={'l'} if 'l' not in held and el<38.3 else set()
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      if int(el)//12>shots:
        shots+=1; await pg.screenshot(path=f'{OUT}/planet-{shots:02d}.png')
        s=await pg.evaluate('gameState()'); logs.append(f't={el:.0f} {s}')
        if shots==3: 
          for k in held: await pg.keyboard.up(k)
          held=set(); await pg.keyboard.press('l'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{OUT}/planet-lang-en.png'); await pg.keyboard.press('l')
        if shots==4: logs.append('FPS '+str(await pg.evaluate('new Promise(r=>{let n=0,t=performance.now();function f(){n++;if(performance.now()-t<1000)requestAnimationFrame(f);else r(n)}requestAnimationFrame(f)})')))
      await pg.wait_for_timeout(120)
    await c.close(); await b.close()
asyncio.run(main()); json.dump(logs,open(OUT+'/planet-log.json','w'),ensure_ascii=False,indent=1); print('\n'.join(logs[-40:]))
