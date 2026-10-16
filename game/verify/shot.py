import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await b.new_page(viewport={"width":1280,"height":800})
        logs=[]
        pg.on("console",lambda m:logs.append(m.text))
        await pg.goto("https://messenger.abeto.co/",wait_until="domcontentloaded",timeout=60000)
        for i,t in enumerate([30]):
            await pg.wait_for_timeout((t-(0 if i==0 else [30][i-1]))*1000)
            await pg.screenshot(path=f"verify/f{i}.png")
        await pg.mouse.click(640,691); await pg.wait_for_timeout(10000)
        await pg.screenshot(path="verify/g0.png")
        await pg.keyboard.down("w"); await pg.wait_for_timeout(3000); await pg.keyboard.up("w"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="verify/f3.png")
        info=await pg.evaluate("""()=>{const c=document.querySelector('canvas');if(!c)return 'nocanvas';const g=c.getContext('webgl2')||c.getContext('webgl');return {w:c.width,h:c.height,gl:!!g}}""")
        print(info); print("\n".join(logs[-15:]))
        await b.close()
asyncio.run(main())
