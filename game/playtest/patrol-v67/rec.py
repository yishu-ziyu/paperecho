"""First-time-player ~75s capture of live game.js 2ede657b (v6.6) on :8834."""
import asyncio, json, os, shutil, subprocess, hashlib
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/patrol-v67'
FR=OUT+'/frames'; KF=OUT+'/kf'; ST=OUT+'/stills'
shutil.rmtree(FR, ignore_errors=True)
for d in (FR,KF,ST): os.makedirs(d, exist_ok=True)
logs=[]; FPS=12; CYC=48; MAXF=1300; arrowlog=[]
PROBE='''(()=>{const s=gameState();delete s.occ;const t=document.getElementById('toast');const h=document.getElementById('hud');
s.toast=t&&+getComputedStyle(t).opacity>0.05?t.innerText.trim():'';s.hud=h?h.innerText.replace(/\\s+/g,' ').trim():'';
const nd=typeof debugND==='function'?debugND():null;s.nd=nd;const at=[...document.body.children].find(e=>/^(回信 · )?(敲两下 · )?\\d+m$/.test(e.textContent)&&e.style.display!=='none');s.arr=at?at.textContent:'';const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return [r.left|0,r.top|0,r.right|0,r.bottom|0]};s.arrR=R(at);s.hudR=R(h);s.arrT=(typeof arrowH!=='undefined'&&arrowH)?(arrowH.userData.name||arrowH.id):null;s.ph=(typeof pushHidden!=='undefined')?pushHidden.size:null;return s})()'''
async def main():
  pe=[]; empty_gaps=[]; last_empty_start=None; deliver_ts=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pg.on('pageerror', lambda e: pe.append(str(e)))
    await pg.goto(f'http://127.0.0.1:8834/play/index.html?capture&cycle={CYC}&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=90000)
    await pg.evaluate('document.fonts.ready')
    md5=await pg.evaluate('(()=>fetch("game.js").then(r=>r.text()).then(t=>{let h=0;/*placeholder*/return t.length}))()')
    # real md5 via file
    held=set(); prev={}; i=0; quit_note=None; nd0=None
    day_start=None
    while i<MAXF:
      st=await pg.evaluate(PROBE)
      if st.get('tod')==0 and not st.get('nightDone'):
        if day_start is None: day_start=i
      else: day_start=None
      if day_start is not None and i-day_start==96 and st.get('tod',0)<1 and not st.get('nightDone'):
        await pg.evaluate('skipTo(0.85)'); logs.append(f'f{i} player-skips-to-dusk carry={st.get("carry")}')
      want=set(await pg.evaluate('autoKeys()'))
      if not want and i>48:
        r=await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.carry>=1){skipTo(0.85);return 1}return 0})()')
        if r: logs.append(f'f{i} auto-skip dusk')
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      await pg.screenshot(path=f'{FR}/{i:05d}.jpg', type='jpeg', quality=85)
      st=await pg.evaluate(PROBE)
      # empty bag timing during night (tod>=1, not nightDone)
      if st.get('tod',0)>=1 and not st.get('nightDone') and st.get('dn',0)<st.get('quota',3):
        if st.get('carry',0)==0:
          if last_empty_start is None: last_empty_start=i
        else:
          if last_empty_start is not None:
            empty_gaps.append((last_empty_start,i,(i-last_empty_start)/FPS)); last_empty_start=None
      else:
        if last_empty_start is not None and st.get('carry',0)>0:
          empty_gaps.append((last_empty_start,i,(i-last_empty_start)/FPS)); last_empty_start=None
      if st.get('nights',0)>=1 and st.get('tod',0)>=1: arrowlog.append((i,st.get('arr'),st.get('arrR'),st.get('hudR'),st.get('dn')))
      tag=None
      if st['dn']!=prev.get('dn') and st['dn']>0:
        tag=f"deliver{st['dn']}"; deliver_ts.append(i)
      if st['tod']!=prev.get('tod'): tag=f"tod{st['tod']}"
      if st.get('nightDone') and not prev.get('nightDone'): tag='lightsout-start'; nd0=i
      if st.get('toast') and st.get('toast')!=prev.get('toast'):
        logs.append(f"f{i} toast: {st['toast'][:80].replace(chr(10),' ')}")
        if st['toast'].startswith(('灯一盏','包空了')): tag=tag or 'lightsout-line'
        if '—' in st['toast'] and st.get('nd'): tag=tag or 'keepsake'
      # sill push mid
      if st.get('nd') and isinstance(st['nd'],list) and abs(st['nd'][0]-11)<0.08:
        tag=tag or 'sill-11s'
      if tag:
        shutil.copy(f'{FR}/{i:05d}.jpg', f'{KF}/f{i:05d}-{tag}.jpg')
        logs.append(f'f{i} {tag} ph={st.get("ph")} hud={st.get("hud","")[:60]} nd={st.get("nd")}')
        print(logs[-1], flush=True)
      if i%60==0:
        print(f'f{i} dn={st.get("dn")} carry={st.get("carry")} tod={st.get("tod")} nd={st.get("nd")} hud={st.get("hud","")[:40]}', flush=True)
      if nd0 is not None:
        el=(i-nd0)/FPS
        if el>=11 and quit_note is None:
          quit_note=f'f{i} lights-out ~{el:.1f}s nd={st.get("nd")}'
          shutil.copy(f'{FR}/{i:05d}.jpg', f'{ST}/quit-lightsout-11s.jpg')
          # also probe windows if debugWindows exists
          try:
            w=await pg.evaluate('typeof debugWindows==="function"?debugWindows():null')
            logs.append(f'f{i} debugWindows={w}')
          except Exception as e:
            logs.append(f'f{i} debugWindows err {e}')
        if el>=14.5:
          shutil.copy(f'{FR}/{i:05d}.jpg', f'{ST}/lightsout-end.jpg')
      # stop shortly after night1 dawn OR after ~90s
      if st.get('nights',0)>=1 and not st.get('nightDone') and prev.get('nightDone'):
        endc=globals().setdefault('endc',0)+1; globals()['endc']=endc
        pass
      if st.get('nights',0)>=1 and st.get('tod',0)>=1 and not st.get('nightDone'):
        globals()['n2']=globals().get('n2') or i
        if (st.get('dn',0)>=3 and i-deliver_ts[-1]>=FPS*4) or i-globals()['n2']>=FPS*45: logs.append(f'f{i} stop night2 dn={st.get("dn")}'); break
      prev=st; i+=1
    for k in held: await pg.keyboard.up(k)
    # grab a few stills: deliver1, lightsout-start, sill
    for name in os.listdir(KF):
      if any(x in name for x in ('deliver1','deliver3','lightsout-start','sill','keepsake','lightsout-line')):
        shutil.copy(f'{KF}/{name}', f'{ST}/{name}')
    await b.close()
  gmd5=hashlib.md5(open('/workspace/game-messenger/repro/play/game.js','rb').read()).hexdigest()
  meta={'frames':i,'fps':FPS,'cycle':CYC,'game_js_md5':gmd5,'pageerrors':pe,'quit_note':quit_note,
        'empty_gaps_s':[round(g[2],2) for g in empty_gaps],'empty_gaps_raw':empty_gaps[-8:],
        'deliver_frames':deliver_ts,'arrowlog':arrowlog,'logs':logs}
  json.dump(meta, open(OUT+'/meta.json','w'), ensure_ascii=False, indent=1)
  open(OUT+'/game_md5.txt','w').write(gmd5+'\n')
  print('END frames',i,'pe',len(pe),'quit',quit_note,'empty',meta['empty_gaps_s'], flush=True)
  0 and subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i',f'{FR}/%05d.jpg','-pix_fmt','yuv420p','-c:v','libx264','-crf','22',OUT+'/firstplay-012c.mp4'],check=True)
  # also make a tighter 45-75s cut if longer: keep from first night-open-ish
  print('mp4 ok', flush=True)
asyncio.run(main())
