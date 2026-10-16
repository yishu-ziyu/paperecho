import asyncio, math, json
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'
logs=[]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    c=await b.new_context(viewport={'width':1280,'height':800},record_video_dir=OUT+'/raw_island',record_video_size={'width':1280,'height':800})
    pg=await c.new_page()
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto('http://localhost:8793/paper-island/?reset')
    await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT+'/island-01-title.png')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
    pos=lambda: pg.evaluate('[__pe.player.pos.x,__pe.player.pos.z]')
    async def walk(tx,tz,limit=18):
      combos=['KeyW','KeyS','KeyA','KeyD']
      for i in range(limit):
        x,z=await pos(); d=math.hypot(tx-x,tz-z)
        if d<0.8: return True
        best=None
        for k in combos:
          await pg.keyboard.down(k); await pg.wait_for_timeout(90); await pg.keyboard.up(k)
          x2,z2=await pos(); d2=math.hypot(tx-x2,tz-z2)
          if best is None or d2<best[0]: best=(d2,k)
          if d2<d-0.05: break
        await pg.keyboard.down(best[1]); await pg.wait_for_timeout(250); await pg.keyboard.up(best[1])
      x,z=await pos(); logs.append(f'STUCK walking to {tx},{tz} at {x:.2f},{z:.2f}'); return False
    async def E(n=1):
      for _ in range(n): await pg.keyboard.press('KeyE'); await pg.wait_for_timeout(900)
    async def fps():
      return await pg.evaluate('new Promise(r=>{let n=0,t=performance.now();function f(){n++;if(performance.now()-t<1000)requestAnimationFrame(f);else r(n)}requestAnimationFrame(f)})')
    logs.append(f'FPS start {await fps()}')
    for night in (1,2):
      await walk(1.05,12.3); await E(); await pg.screenshot(path=OUT+f'/island-n{night}-letter.png'); await E()
      for k,(x,z) in {'gate':(0,-2.55),'well':(-1.7,-3.75),'door':(1.55,-4.55)}.items():
        ok=await walk(x,z)
        if not ok: await pg.evaluate(f'__pe.player.pos.set({x},0,{z})'); logs.append(f'teleported to {k}')
        await E(); await pg.screenshot(path=OUT+f'/island-n{night}-{k}.png'); await E(2)
        logs.append(f'n{night} {k} state='+str(await pg.evaluate('__pe.quest.state')))
      await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT+f'/island-n{night}-lamp.png')
      logs.append(f'FPS n{night} {await fps()}')
      await pg.keyboard.press('KeyR'); await pg.wait_for_timeout(2000)
    await c.close(); await b.close()
asyncio.run(main())
json.dump(logs,open(OUT+'/island-log.json','w'),indent=1,ensure_ascii=False)
print('\n'.join(logs))
