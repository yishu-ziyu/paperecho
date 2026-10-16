import asyncio,json
from playwright.async_api import async_playwright
HOOK=r"""
(()=>{window.__L={frames:[],shaders:[],cur:null,rec:false};
const P=WebGL2RenderingContext.prototype;
const ss=P.shaderSource;P.shaderSource=function(s,src){if(window.__L.shaders.length<400)window.__L.shaders.push(src);return ss.call(this,s,src)};
const pid=new WeakMap();let n=0;const lp=P.linkProgram;P.linkProgram=function(p){pid.set(p,n++);return lp.call(this,p)};
const L=window.__L;function ev(e){if(L.rec&&L.cur&&L.cur.length<3000)L.cur.push(e)}
const bf=P.bindFramebuffer;const fid=new WeakMap();let fn=1;P.bindFramebuffer=function(t,f){if(f&&!fid.has(f))fid.set(f,fn++);ev('FB '+(f?fid.get(f):0));return bf.call(this,t,f)};
const up=P.useProgram;P.useProgram=function(p){ev('P '+(p?pid.get(p):-1));return up.call(this,p)};
const db=P.drawBuffers;P.drawBuffers=function(b){ev('DB '+b.length);return db.call(this,b)};
for(const k of['drawArrays','drawElements','drawElementsInstanced','drawArraysInstanced']){const o=P[k];P[k]=function(...a){ev('D '+k);return o.apply(this,a)}}
const raf=window.requestAnimationFrame;window.requestAnimationFrame=function(cb){return raf.call(window,t=>{if(L.rec){L.cur=[];}cb(t);if(L.rec&&L.cur){L.frames.push(L.cur);if(L.frames.length>=3)L.rec=false;}})};
})();"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=await b.new_page(viewport={"width":1280,"height":800})
    await pg.add_init_script(HOOK)
    await pg.goto("https://messenger.abeto.co/",wait_until="domcontentloaded",timeout=60000)
    await pg.wait_for_timeout(30000); await pg.mouse.click(640,691); await pg.wait_for_timeout(100000)
    await pg.screenshot(path="orig.png")
    await pg.evaluate("window.__L.rec=true"); await pg.wait_for_timeout(20000)
    d=await pg.evaluate("({f:window.__L.frames,s:window.__L.shaders})")
    json.dump(d,open("gllog.json","w")); print("frames",len(d['f']),"shaders",len(d['s']))
    await b.close()
asyncio.run(main())
