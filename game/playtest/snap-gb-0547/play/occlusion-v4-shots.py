# v4 verification in the REAL game: before = v3 (/tmp/occlusion.v3.js served by routing), after = occlusion.js
# feet case: a tree that blocks only the leg ray (no chest/head) -> expect NO hole; upper case: chest/head blocked -> clean hole.
import asyncio,os,subprocess,time,json
ROOT=os.path.dirname(os.path.abspath(__file__));OUT=f"{ROOT}/occlusion-shots";os.makedirs(OUT,exist_ok=True)
V3=open("/tmp/occlusion.v3.js").read()
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
URL="/play/index.html?capture&nosave&palette=night&cycle=100000"
async def settle(pg,n=8):
  for _ in range(n): await pg.wait_for_timeout(40);await pg.evaluate("window.tick(1/30)")
async def page(b,port,v3):
  pg=await b.new_page(viewport={"width":1280,"height":800});errs=[]
  pg.on("pageerror",lambda e:errs.append(str(e)));pg.on("console",lambda m:errs.append(m.text) if m.type in("error","warning") and "404" not in m.text else None)
  if v3: await pg.route("**/occlusion.js",lambda r:r.fulfill(status=200,content_type="text/javascript",body=V3))
  await pg.goto(f"http://localhost:{port}{URL}");await pg.wait_for_function("window.ready",timeout=180000);await pg.evaluate("document.fonts.ready")
  return pg,errs
async def main():
  port=8962;srv=subprocess.Popen(["python3","-m","http.server",str(port)],cwd=os.path.dirname(ROOT),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1.2)
  try:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
      b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=ARGS)
      pg,errs=await page(b,port,False)
      found={}
      for i in range(8):
        for dd in (1.2,1.5,1.8,2.1,2.5,3.0,3.5):
          await pg.evaluate(f"window.debugBehindTree({i},{dd})");await settle(pg,3)
          r=await pg.evaluate("window.__occ.rays()")
          up=r.get('chest',0)+r.get('head',0)
          if r.get('legs',0)>0 and up==0 and 'feet' not in found: found['feet']=(i,dd)
          if up>0 and 'upper' not in found: found['upper']=(i,dd)
        if len(found)==2: break
      print("found",found,flush=True);await pg.close()
      res={}
      for case,(i,dd) in found.items():
        for mode in ("before","after"):
          pg,errs=await page(b,port,mode=="before")
          await pg.evaluate(f"window.debugBehindTree({i},{dd})");await settle(pg,10)
          info=await pg.evaluate("({faded:window.__occ.faded(),rays:window.__occ.rays?window.__occ.rays():null,player:window.__occ.playerPatched?window.__occ.playerPatched():'n/a'})")
          await pg.screenshot(path=f"{OUT}/v4-{case}-{mode}.png",timeout=300000)
          res[f"{case}-{mode}"]=info;print(case,mode,json.dumps(info),errs[:3],flush=True);await pg.close()
      await b.close()
  finally: srv.kill()
asyncio.run(main())
