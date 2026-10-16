# Numeric proof for lightsOut: per-house window level during nightDone (snapshot snap-gb-0547, port 8862). Nights 1-3.
import asyncio, json
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/gb'; FPS=12
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':480,'height':300})).new_page()
    pe=[]; pg.on('pageerror', lambda e: pe.append(str(e)))
    await pg.goto('http://127.0.0.1:8862/play/index.html?capture&cycle=80&glow=1.2&nosave')
    await pg.wait_for_function('window.ready', timeout=120000)
    await pg.evaluate('window.__apWait=3; skipTo(1.55)')
    held=set(); res=[]; ndT=None; sampled=set(); night=None
    for i in range(12*600):
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      if st['tod'] in (0,1) and not st['nightDone'] and not st.get('postBeat') and st['carry']>=1: await pg.evaluate('skipTo(1.55)')
      want=set(await pg.evaluate('autoKeys()'))
      for k in held-want: await pg.keyboard.up(k)
      for k in want-held: await pg.keyboard.down(k)
      held=want
      await pg.evaluate(f'tick({1/FPS})')
      st=await pg.evaluate('(()=>{const s=gameState();delete s.occ;return s})()')
      if st['nightDone']:
        if ndT is None: ndT=i; sampled=set(); night=st['night']+1
        t=(i-ndT)/FPS
        for mark in (0.1,5,10,15,19.5):
          if t>=mark and mark not in sampled:
            sampled.add(mark)
            w=await pg.evaluate('debugWindows()'); d=await pg.evaluate('PaperEcho.deliveredThisNight.slice()')
            vis=[x for x in w if x['visible']]
            kept=[x for x in vis if x['i'] in d]; other=[x for x in vis if x['i'] not in d]
            row={'night':night,'t':mark,'delivered_idx':d,'kept_on':[x['on'] for x in kept],'others_on_mean':round(sum(x['on'] for x in other)/max(1,len(other)),3),'others_lit_count':sum(1 for x in other if x['on']>0.5),'others_n':len(other)}
            res.append(row); print(json.dumps(row,ensure_ascii=False),flush=True)
      else: ndT=None
      if st['nights']>=2 and not st['nightDone']: break
    await b.close()
  json.dump({'rows':res,'pe':pe}, open(OUT+'/lo-probe-v62.json','w'), ensure_ascii=False, indent=1); print('END pageerrors',len(pe))
asyncio.run(main())
