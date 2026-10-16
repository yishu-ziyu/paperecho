# night-2 manual empty-bag stress: after delivery 2 of night 2, the player walks away from letters (random walk + far trips), never steering toward letters
import asyncio,random,sys
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':800,'height':500})).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=48&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('window.__apNoWait=true')
    res=[]
    for seed in range(int(sys.argv[1]) if len(sys.argv)>1 else 6):
      random.seed(seed); held=set(); wander=[]; empty=0; mx=0; beamseen=False; i=0
      while i<4000:
        s=await pg.evaluate('(()=>{const s=gameState();return [s.night,s.dn,s.quota,s.carry,s.tod,s.nightDone]})()')
        n,dn,q,carry,tod,nd=s
        if n>1: break
        manual = n==1 and dn>=2 and carry==0 and dn<q and tod==2 and not nd
        if manual:
          if not wander:
            wander=[['w']]*random.randint(40,100) if random.random()<0.3 else [random.choice([['w'],['w','a'],['w','d'],['w','a'],['w','d']])]*random.randint(6,30)
          want=set(wander.pop(0)); empty+=1; mx=max(mx,empty)
          if await pg.evaluate('debugBeams()'): beamseen=True
        else:
          if empty and carry>0: res.append((seed,round(empty/12,1),beamseen)); empty=0
          want=set(await pg.evaluate('autoKeys()'))
          if not want: await pg.evaluate('(()=>{const s=gameState();if(s.tod===0&&!s.nightDone&&s.targets.length)skipTo(0.8)})()')
        for k in held-want: await pg.keyboard.up(k)
        for k in want-held: await pg.keyboard.down(k)
        held=want
        await pg.evaluate('stepOnly(1/12)'); i+=1
      if empty: res.append((seed,round(empty/12,1),beamseen,'unfinished'))
      await pg.reload(); await pg.wait_for_function('window.ready',timeout=60000); await pg.evaluate('window.__apNoWait=true')
    print('EMPTYBAG runs (seed, seconds empty while letters owed, guide beam seen):',res)
    print('MAX',max([r[1] for r in res] or [0]),'ERRORS',errs[:2])
    await b.close()
asyncio.run(main())
