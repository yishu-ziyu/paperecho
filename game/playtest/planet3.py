import asyncio, json, os, time, sys, subprocess, shutil
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest'; ROOT=OUT+'/snap-0249'; FR=OUT+'/v2_frames'; shutil.rmtree(FR,ignore_errors=True); os.makedirs(FR); logs=[]
FPS=12; N=900; PORT='8796'
async def main():
  srv=subprocess.Popen(['python3','-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
  try:
   async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':1120,'height':700})).new_page()
    pg.on('console',lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('response',lambda r: r.status>=400 and 'favicon' not in r.url and logs.append(f'HTTP {r.status} {r.url}'))
    t0=time.time(); await pg.goto(f'http://localhost:{PORT}/play/index.html?capture&cycle=30&glow=1.2&nosave')
    await pg.wait_for_function('window.ready',timeout=120000); await pg.evaluate('document.fonts.ready'); logs.append(f'load {time.time()-t0:.1f}s')
    held=set()
    for i in range(N):
      want=set(await pg.evaluate('autoKeys()'))
      if 300<=i<348: want=set()
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      if i in (300,336): await pg.keyboard.press('l')
      await pg.evaluate(f'tick({1/FPS})')
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg',type='jpeg',quality=88)
      if i%60==0: logs.append(f'f{i} t={i/FPS:.0f}s {json.dumps(await pg.evaluate("gameState()"),ensure_ascii=False)[:400]}')
    logs.append('final '+json.dumps(await pg.evaluate("gameState()"),ensure_ascii=False)[:600])
    await b.close()
  finally: srv.kill()
asyncio.run(main()); json.dump(logs,open(OUT+'/planet-v2-log.json','w'),ensure_ascii=False,indent=1); print('\n'.join(logs))
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i',f'{FR}/%05d.jpg','-pix_fmt','yuv420p','-c:v','libx264','-crf','21',OUT+'/planet-play-v2.mp4'],check=True)
