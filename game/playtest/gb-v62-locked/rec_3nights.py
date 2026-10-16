"""gb-v62-locked: 3-night playthrough, game.js 484c4759 / daynight 36e37716 / occlusion 21357bb7. Template: patrol-0630/rec_first.py"""
import asyncio, json, os, shutil, subprocess
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/gb-v62-locked'
FR=OUT+'/frames'; KF=OUT+'/kf'
shutil.rmtree(FR, ignore_errors=True); os.makedirs(FR); os.makedirs(KF, exist_ok=True)
FPS=12; CYC=48; MAXF=4200
PROBE='''(()=>{const s=gameState();delete s.occ;const t=document.getElementById('toast');const h=document.getElementById('hud');
s.toast=t&&+getComputedStyle(t).opacity>0.05?t.innerText.trim():'';s.hud=h?h.innerText.replace(/\\s+/g,' ').trim():'';return s})()'''
async def main():
  rows=[]; logs=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pe=[]; pg.on('pageerror', lambda e: pe.append(str(e)))
    await pg.goto(f'http://127.0.0.1:8834/play/index.html?capture&cycle={CYC}&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=90000); await pg.evaluate('document.fonts.ready')
    held=set(); prev={}; i=0; dayStart={}; post=0
    while i<MAXF:
      st=await pg.evaluate(PROBE)
      n=st.get('night',0)
      if st.get('tod')==0 and not st.get('nightDone'): dayStart.setdefault(n,i)
      # real player: night1 day ~8s then skip; day2 let ~15s run; day3 ~8s
      lim={1:180}.get(n,96)
      if st.get('tod')==0 and not st.get('nightDone') and n in dayStart and i-dayStart[n]==lim and st.get('carry',0)>=1:
        await pg.evaluate('skipTo(0.85)'); logs.append(f'f{i} player presses N to dusk (night{n+1}, day {lim/FPS:.1f}s)')
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=88)
      st=await pg.evaluate(PROBE); st['f']=i; st['keys']=sorted(want); rows.append(st)
      tag=None
      if st['dn']!=prev.get('dn') and st['dn']>0: tag=f"n{n+1}-deliver{st['dn']}"
      if st['tod']!=prev.get('tod'): tag=f"n{n+1}-tod{st['tod']}"
      if st.get('nightDone') and not prev.get('nightDone'): tag=f'n{n+1}-nightdone'
      if st['toast'] and st['toast']!=prev.get('toast'): logs.append(f"f{i} toast: {st['toast'][:60]}")
      if tag:
        shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-{tag}.jpg'); logs.append(f'f{i} {tag} carry={st["carry"]} found={st.get("found")}/{st.get("crCap")} hud={st["hud"][:50]}'); print(logs[-1],flush=True)
      if prev.get('nightDone') and not st.get('nightDone'): logs.append(f'f{i} daybreak night{n}')
      if st.get('np',{}) and isinstance(st['np'],dict) and st['np'].get('finished'): pass
      if await pg.evaluate('!!(window.PaperEcho&&window.PaperEcho.finished)'):
        post+=1
        if post>180: logs.append(f'f{i} stop: finished+15s'); break
      prev=st; i+=1
    await b.close()
  json.dump(rows, open(OUT+'/trace.json','w'), ensure_ascii=False)
  json.dump({'frames':i,'fps':FPS,'cycle':CYC,'md5':{'game.js':'484c4759','daynight.js':'36e37716','occlusion.js':'21357bb7'},'pageerrors':pe,'logs':logs}, open(OUT+'/meta.json','w'), ensure_ascii=False, indent=1)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i',f'{FR}/%05d.jpg','-pix_fmt','yuv420p','-c:v','libx264','-crf','23',OUT+'/full-3nights.mp4'],check=True)
  print('END',i,flush=True)
asyncio.run(main())
