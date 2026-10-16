# before (v1 whole-object fade, /tmp/occlusion.devin.js) vs after (v2 circular cutout) in the REAL game.
# cases: tree = debugBehindTree(1,1.4); delivery = autoplay with real keypresses until the first delivery push-in (v4-f120 situation).
import asyncio,os,subprocess,time,json,sys
ROOT=os.path.dirname(os.path.abspath(__file__));OUT=f"{ROOT}/occlusion-shots";os.makedirs(OUT,exist_ok=True)
V1=open("/tmp/occlusion.devin.js").read() if os.path.exists("/tmp/occlusion.devin.js") else None
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
SUF=os.environ.get("SUF","")
CASES=sys.argv[1:] or ["tree","delivery"]
async def settle(pg,n=10):
  for _ in range(n): await pg.wait_for_timeout(50);await pg.evaluate("window.tick(1/30)")
async def main():
  port=8961;srv=subprocess.Popen(["python3","-m","http.server",str(port)],cwd=os.path.dirname(ROOT),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1.2)
  res={}
  try:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
      b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=ARGS)
      for case in CASES:
        for mode in ("before","after"):
          pg=await b.new_page(viewport={"width":1280,"height":800});errs=[]
          pg.on("pageerror",lambda e:errs.append(str(e)));pg.on("console",lambda m:errs.append(m.text) if m.type in("error","warning") and "404" not in m.text else None)
          if mode=="before" and V1: await pg.route("**/occlusion.js",lambda r:r.fulfill(status=200,content_type="text/javascript",body=V1))
          await pg.goto(f"http://localhost:{port}/play/index.html?capture&nosave&palette=dusk&cycle=100000");await pg.wait_for_function("window.ready",timeout=120000)
          await pg.evaluate("document.fonts.ready")
          if case=="tree":
            await pg.evaluate("window.debugBehindTree(1,1.4)");await settle(pg)
          else:
            held=set()
            for i in range(24*120):
              want=set(await pg.evaluate("autoKeys()"))
              for k in held-want: await pg.keyboard.up(k)
              for k in want-held: await pg.keyboard.down(k)
              held=want;await pg.evaluate("tick(1/24)")
              if (await pg.evaluate("gameState().delivered"))>=1: break
            for k in held: await pg.keyboard.up(k)
            for _ in range(14): await pg.wait_for_timeout(40);await pg.evaluate("tick(1/24)")
          info=await pg.evaluate("window.__occ?{faded:window.__occ.faded(),player:(window.__occ.playerPatched?window.__occ.playerPatched():'n/a')}:null")
          await pg.screenshot(path=f"{OUT}/{case}-{mode}{SUF if mode=='after' else ''}.png",timeout=240000)
          res[f"{case}-{mode}"]={"occ":info,"delivered":await pg.evaluate("gameState().delivered"),"errors":errs[:5]};print(case,mode,json.dumps(res[f"{case}-{mode}"],ensure_ascii=False),flush=True);await pg.close()
      await b.close()
  finally: srv.kill()
asyncio.run(main())
