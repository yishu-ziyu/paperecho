import asyncio, json, os, time, subprocess, shutil, sys
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'; FR=OUT+'/v6_frames'; KF=OUT+'/v6-keyframes'
shutil.rmtree(FR, ignore_errors=True); os.makedirs(FR); os.makedirs(KF,exist_ok=True)
logs=[]; FPS=12; CYC=float(sys.argv[1]) if len(sys.argv)>1 else 52; MAXF=int(sys.argv[2]) if len(sys.argv)>2 else 2100
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    await pg.goto(f'http://localhost:8834/play/index.html?capture&cycle={CYC}&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=60000); await pg.evaluate('document.fonts.ready')
    await pg.evaluate('window.__apWait=3')
    held=set(); prev={}; i=0
    while i<MAXF:
      want=set(await pg.evaluate('autoKeys()'))
      if not want and i>24:
        r=await pg.evaluate('(()=>{const s=gameState();if((s.tod===0||s.tod===1)&&!s.nightDone){skipTo(1.5);return 1}return 0})()')
        if r: logs.append(f'f{i} skip to night')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=88)
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      tag=None
      if st['dn']!=prev.get('dn') and st['dn']>0: tag=f"n{st['night']+1}-deliver{st['dn']}"
      if st['tod']!=prev.get('tod'): tag=f"n{st['night']+1}-tod{st['tod']}"
      if st['areaOpen'] and not prev.get('areaOpen'): tag='n2-area-open'
      if tag:
        logs.append(f'f{i} {tag} '+json.dumps(st,ensure_ascii=False)[:300])
        await pg.evaluate(f'window.__kf=(window.__kf||[]);window.__kf.push([{i+18},"{tag}"])')
      kf=await pg.evaluate(f'(window.__kf||[]).filter(k=>k[0]=={i}).map(k=>k[1])')
      for t in kf: shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-{t}.jpg')
      if i%120==0: logs.append(f'f{i} '+json.dumps(st,ensure_ascii=False)[:300]); print(logs[-1],flush=True)
      prev=st; i+=1
      if st['nights']>=3:
        endc=globals().setdefault('endc',[0]); endc[0]+=1
        if endc[0]>60: break
    # occlusion clip: behind trees / houses
    for k in held: await pg.keyboard.up(k)
    for tr in range(3):
      await pg.evaluate(f'window.__noLift=true;debugBehindTree({tr*7+1},1.4)')
      for j in range(48):
        keys=['w'] if j>12 else []
        for k in keys: await pg.keyboard.down(k)
        await pg.evaluate(f'tick({1/FPS})')
        for k in keys: await pg.keyboard.up(k)
        await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=88)
        if j==8: shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-occlusion-tree{tr}.jpg'); logs.append('occ '+json.dumps(await pg.evaluate('gameState().occ')))
        i+=1
    await b.close()
asyncio.run(main())
json.dump(logs, open(OUT+'/planet-v6-log.json','w'), ensure_ascii=False, indent=1)
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i',f'{FR}/%05d.jpg','-pix_fmt','yuv420p','-c:v','libx264','-crf','21',OUT+'/planet-play-v6.mp4'],check=True)
print('mp4 ok', i)
