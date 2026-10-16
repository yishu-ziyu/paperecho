# usage: python3 capture.py <dir> <query> <outprefix> [N]
import asyncio,base64,os,subprocess,sys,shutil
D,Q,OUT=sys.argv[1],sys.argv[2],sys.argv[3];N=int(sys.argv[4]) if len(sys.argv)>4 else 168
ROOT=os.path.dirname(os.path.abspath(__file__))
async def main():
  srv=subprocess.Popen(["python3","-m","http.server","8792"],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  import time;time.sleep(1.5)
  fd=f"{ROOT}/{D}/frames_{OUT}";shutil.rmtree(fd,ignore_errors=True);os.makedirs(fd)
  try:
    async with async_playwright() as p:
      b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
      pg=await b.new_page(viewport={"width":1280,"height":800});logs=[];pg.on("console",lambda m:logs.append(m.text));pg.on("pageerror",lambda e:logs.append("ERR "+str(e)))
      await pg.goto(f"http://localhost:8792/{D}/index.html?capture&{Q}")
      try: await pg.wait_for_function("window.ready",timeout=120000)
      except Exception as e: print("\n".join(logs));raise
      for i in range(N):
        u=await pg.evaluate(f"(()=>{{renderFrame({i/24});return document.querySelector('canvas').toDataURL('image/png')}})()")
        open(f"{fd}/{i:04d}.png","wb").write(base64.b64decode(u.split(",")[1]))
      print("\n".join(l for l in logs if '404' not in l)[-3000:]);await b.close()
  finally: srv.kill()
from playwright.async_api import async_playwright
asyncio.run(main())
fd=f"{ROOT}/{D}/frames_{OUT}"
shutil.copy(f"{fd}/{min(N-1,72):04d}.png",f"{ROOT}/{D}/{OUT}_still.png")
if N>24:
  subprocess.run(["ffmpeg","-y","-loglevel","error","-framerate","24","-i",f"{fd}/%04d.png","-pix_fmt","yuv420p","-c:v","libx264","-crf","18",f"{ROOT}/{D}/{OUT}.mp4"],check=True)
  subprocess.run(["ffmpeg","-y","-loglevel","error","-i",f"{ROOT}/../verify/orig.png","-i",f"{ROOT}/{D}/{OUT}_still.png","-filter_complex","[0]scale=-1:800[a];[1]scale=-1:800[b];[a][b]hstack",f"{ROOT}/{D}/{OUT}_compare.png"],check=True)
