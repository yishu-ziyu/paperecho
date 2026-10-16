import asyncio, json, os, math, time
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'; FR=OUT+'/island_frames'; os.makedirs(FR,exist_ok=True); logs=[]
INIT="""(()=>{let ft=0;const p0=performance.now.bind(performance);const base=p0();performance.now=()=>base+ft;let cbs=[];
window.requestAnimationFrame=cb=>{cbs.push(cb);return cbs.length};
window.__step=ms=>{ft+=ms;const c=cbs;cbs=[];c.forEach(f=>f(base+ft));};})();"""
fi=0
async def main():
  global fi
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1280,'height':800})).new_page()
    await pg.add_init_script(INIT)
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text} {m.location.get("url","")}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('response',lambda r: r.status>=400 and logs.append(f'HTTP {r.status} {r.url}'))
    await pg.goto('http://localhost:8793/paper-island/?reset'); await pg.wait_for_function('window.ready',timeout=60000)
    async def frame(n=1):
      global fi
      for _ in range(n):
        await pg.evaluate('__step(100)'); await pg.screenshot(path=f'{FR}/{fi:05d}.jpg',type='jpeg',quality=88); fi+=1
    async def shot(name): await pg.screenshot(path=f'{OUT}/island-{name}.png')
    await frame(15); await shot('01-title'); await pg.keyboard.press('Enter'); await frame(15)
    held=set()
    async def setk(want):
      nonlocal held
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
    async def walk(tx,tz,r=0.9,maxf=140):
      for i in range(maxf):
        px,pz,cx,cz=await pg.evaluate('[__pe.player.pos.x,__pe.player.pos.z,__pe.camera.position.x,__pe.camera.position.z]')
        dx,dz=tx-px,tz-pz; d=math.hypot(dx,dz)
        if d<r: await setk(set()); await frame(3); return True
        dx/=d;dz/=d; y=-math.atan2(cx-px,cz-pz); ix=dx*math.cos(y)+dz*math.sin(y); iz=-dx*math.sin(y)+dz*math.cos(y)
        w=set()
        if ix>0.38:w.add('d')
        if ix<-0.38:w.add('a')
        if iz>0.38:w.add('s')
        if iz<-0.38:w.add('w')
        await setk(w); await frame()
      await setk(set()); logs.append(f'STUCK to {tx},{tz} at {px:.2f},{pz:.2f}'); return False
    async def E(n=1,wait=12):
      for _ in range(n): await pg.keyboard.press('e'); await frame(wait)
    st=lambda: pg.evaluate('__pe.quest.state')
    for night in (1,2,3):
      await walk(0.9,11.9,1.0); await E(1,8); await shot(f'n{night}-letter'); logs.append(f'n{night} after letter E: {await st()}')
      await E(1,8); logs.append(f'n{night} after close: {await st()}')
      for k,(x,z) in {'gate':(0,-2.0),'well':(-1.7,-3.2),'door':(1.55,-4.0)}.items():
        await walk(x,z,0.9); s0=await st(); await E(1,10); await shot(f'n{night}-{k}')
        for _ in range(3):
          if await pg.evaluate("document.querySelector('#card.show,#letter-wrap.show')!==null"): await E(1,8)
        logs.append(f'n{night} {k}: {s0} -> {await st()}')
      await frame(25); await shot(f'n{night}-lamp')
      await walk(0.5,-0.5,1.0,40); await frame(10)
      await pg.keyboard.press('r'); await frame(20); logs.append(f'after R: {await st()}')
      if fi>820: break
    await b.close()
t=time.time(); asyncio.run(main()); logs.append(f'frames {fi} in {time.time()-t:.0f}s')
json.dump(logs,open(OUT+'/island-log.json','w'),ensure_ascii=False,indent=1); print('\n'.join(logs))
