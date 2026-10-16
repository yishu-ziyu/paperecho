"""First-time-player 60-75s capture of stable v6.2 (63e2743c) on :8834."""
import asyncio, json, os, shutil, subprocess
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/patrol-0630'
FR=OUT+'/frames'; KF=OUT+'/kf'
shutil.rmtree(FR, ignore_errors=True); os.makedirs(FR); os.makedirs(KF, exist_ok=True)
logs=[]; FPS=12; CYC=48; MAXF=900  # ~75s
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pe=[]; pg.on('pageerror', lambda e: pe.append(str(e))); pg.on('console', lambda m: logs.append(f'{m.type}:{m.text}') if m.type in ('error','warning') else None)
    await pg.goto(f'http://127.0.0.1:8834/play/index.html?capture&cycle={CYC}&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=90000)
    await pg.evaluate('document.fonts.ready')
    # First-player: short day wander then open night; keep autopilot for deliveries
    await pg.evaluate('window.__apWait=4')
    held=set(); prev={}; i=0; quit_note=None
    while i<MAXF:
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      # After ~8s day with bag full, skip toward dusk (player would get bored)
      if i==96 and st.get('carry',0)>=1 and st.get('tod',0)<1:
        await pg.evaluate('skipTo(0.85)'); logs.append(f'f{i} player-skips-to-dusk carry={st["carry"]}')
      want=set(await pg.evaluate('autoKeys()'))
      if not want and i>36:
        r=await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.carry>=1){skipTo(0.85);return 1}return 0})()')
        if r: logs.append(f'f{i} auto-skip dusk')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=85)
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      tag=None
      if st['dn']!=prev.get('dn') and st['dn']>0: tag=f"deliver{st['dn']}"
      if st['tod']!=prev.get('tod'): tag=f"tod{st['tod']}"
      if st.get('nightDone') and not prev.get('nightDone'): tag='lightsout-start'
      if tag:
        shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-{tag}.jpg')
        logs.append(f'f{i} {tag} '+json.dumps({k:st.get(k) for k in ["night","dn","carry","tod","nights","hint","ph"]},ensure_ascii=False))
        print(logs[-1], flush=True)
      if i%60==0:
        print(f'f{i} '+json.dumps({k:st.get(k) for k in ["night","dn","carry","tod","nights","ph","hint"]},ensure_ascii=False), flush=True)
      # Quit moment heuristic: long dead wait, or black pillar, or after lights-out 8s
      if st.get('nightDone'):
        nd=globals().setdefault('nd0', i)
        if (i-nd)/FPS >= 12 and quit_note is None:
          quit_note=f'f{i} lights-out ~12s — checking if windows dim; if not, quit urge'
          shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-lightsout-12s.jpg')
      if st.get('nights',0)>=1 and not st.get('nightDone') and prev.get('nightDone'):
        # dawn after night1 — enough for 60-75s first-player clip
        endc=globals().setdefault('endc',0); endc+=1; globals()['endc']=endc
        if endc>24: logs.append(f'f{i} stop after night1 dawn'); break
      prev=st; i+=1
    for k in held: await pg.keyboard.up(k)
    await b.close()
  meta={'frames':i,'pageerrors':pe,'quit_note':quit_note,'logs':logs[-40:]}
  json.dump(meta, open(OUT+'/meta.json','w'), ensure_ascii=False, indent=1)
  print('END frames',i,'pe',len(pe),'quit',quit_note, flush=True)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i',f'{FR}/%05d.jpg','-pix_fmt','yuv420p','-c:v','libx264','-crf','22',OUT+'/firstplay-v62.mp4'],check=True)
  # also trim to ~75s max if longer
  print('mp4 ok', OUT+'/firstplay-v62.mp4', flush=True)
asyncio.run(main())
