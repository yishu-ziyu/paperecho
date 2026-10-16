# usage: python3 playcap.py <query> <out.mp4> <seconds> <mode: script|auto> ; scripted keyboard play, port 8792
import asyncio,os,subprocess,sys,shutil,time,json
Q,OUT,SEC,MODE=sys.argv[1],sys.argv[2],float(sys.argv[3]),sys.argv[4];PORT=sys.argv[5] if len(sys.argv)>5 else "8792"
ROOT=os.path.dirname(os.path.abspath(__file__));FD=f"/tmp/pc_{os.path.basename(OUT)}";shutil.rmtree(FD,ignore_errors=True);os.makedirs(FD)
SCRIPT=[(0,['w']),(8,['w','a']),(9.2,['w']),(20,['w','d']),(21.5,['w']),(27,['a']),(28.2,['w']),(33,['w','d']),(34,['w']),(40,['s']),(41.5,['w','a']),(43,['w']),(52,['d']),(53.5,['w']),(60,['w','a']),(62,['w'])]
async def main():
  srv=subprocess.Popen(["python3","-m","http.server",PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1.5)
  try:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
      b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
      pg=await b.new_page(viewport={"width":int(os.environ.get("VW","1280")),"height":int(os.environ.get("VH","800"))});logs=[];pg.on("console",lambda m:logs.append(m.text));pg.on("pageerror",lambda e:logs.append("ERR "+str(e)))
      await pg.goto(f"http://localhost:{PORT}/play/index.html?capture&{Q}")
      try: await pg.wait_for_function("window.ready",timeout=180000)
      except Exception: print("\n".join(logs));raise
      await pg.evaluate("document.fonts.ready")
      held=set();fps=15;N=int(SEC*fps)
      for i in range(N):
        t=i/fps
        if MODE=='script':
          pass
        if MODE=='script': want=set([k for (t0,k) in SCRIPT if t0<=t][-1])
        else: want=set(await pg.evaluate("autoKeys()"))
        for k in held-want: await pg.keyboard.up(k)
        for k in want-held: await pg.keyboard.down(k)
        held=want
        await pg.evaluate(f"tick({1/fps})")
        await pg.screenshot(path=f"{FD}/{i:04d}.jpg",type="jpeg",quality=88)
      print(json.dumps(await pg.evaluate("gameState()")));print("\n".join(l for l in logs if '404' not in l)[-2000:])
      await b.close()
  finally: srv.kill()
asyncio.run(main())
subprocess.run(["ffmpeg","-y","-loglevel","error","-framerate","15","-i",f"{FD}/%04d.jpg","-pix_fmt","yuv420p","-c:v","libx264","-crf","20",OUT],check=True)
n=len(os.listdir(FD))
for f in (0.15,0.5,0.85): shutil.copy(f"{FD}/{int(f*(n-1)):04d}.jpg",OUT.replace(".mp4",f"_{int(f*100)}.jpg"))
