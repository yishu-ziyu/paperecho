# v4.1: v51 repro (rec_v5_final.py occlusion clip: __noLift, debugBehindTree(1,1.4), 9 ticks no keys, shot at j==8) v3 vs v4.1; plus upper case reshoot.
import asyncio,os,subprocess,time,json
ROOT=os.path.dirname(os.path.abspath(__file__));OUT=f"{ROOT}/occlusion-shots"
V3=open(f"{ROOT}/occlusion.v3.bak.js").read()
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
async def page(b,port,v3,q):
  pg=await b.new_page(viewport={"width":1280,"height":800});errs=[]
  pg.on("pageerror",lambda e:errs.append(str(e)));pg.on("console",lambda m:errs.append(m.text) if m.type in("error","warning") and "404" not in m.text else None)
  if v3: await pg.route("**/occlusion.js",lambda r:r.fulfill(status=200,content_type="text/javascript",body=V3))
  await pg.goto(f"http://localhost:{port}/play/index.html?capture&nosave&{q}");await pg.wait_for_function("window.ready",timeout=180000);await pg.evaluate("document.fonts.ready")
  return pg,errs
async def main():
  port=8963;srv=subprocess.Popen(["python3","-m","http.server",str(port)],cwd=os.path.dirname(ROOT),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1.2)
  try:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
      b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=ARGS)
      for name,v3 in (("v43-v51repro-after",False),):
        pg,errs=await page(b,port,v3,"palette=night&cycle=100000")
        await pg.evaluate("window.__noLift=true;debugBehindTree(1,1.4)")
        for j in range(9): await pg.evaluate("tick(1/24)")
        info=await pg.evaluate("({occ:gameState().occ,rays:window.__occ&&window.__occ.rays?window.__occ.rays():null})")
        await pg.screenshot(path=f"{OUT}/{name}.png",timeout=300000);print(name,json.dumps(info),errs[:3],flush=True);await pg.close()
      pg,errs=await page(b,port,False,"palette=night&cycle=100000")
      await pg.evaluate("debugBehindTree(0,1.2)")
      for _ in range(10): await pg.wait_for_timeout(40);await pg.evaluate("tick(1/30)")
      info=await pg.evaluate("({occ:gameState().occ,rays:window.__occ.rays(),player:window.__occ.playerPatched()})")
      await pg.screenshot(path=f"{OUT}/v43-upper-after.png",timeout=300000);print("v41-upper-after",json.dumps(info),errs[:3],flush=True)
      await b.close()
  finally: srv.kill()
asyncio.run(main())
