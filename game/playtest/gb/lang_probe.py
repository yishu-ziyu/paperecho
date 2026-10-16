import asyncio, json
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/playtest/gb'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await (await b.new_context(viewport={'width':960,'height':600})).new_page()
    pe=[]; pg.on('pageerror', lambda e: pe.append(str(e)))
    await pg.goto('http://127.0.0.1:8861/play/index.html?capture&cycle=80&nosave'); await pg.wait_for_function('window.ready',timeout=120000); await pg.evaluate('document.fonts.ready')
    await pg.evaluate('skipTo(1.8)'); 
    for _ in range(6): await pg.evaluate('tick(1/12)')
    g=lambda: pg.evaluate('({hud:document.getElementById("hud").innerText,tod:document.getElementById("tod").innerText,hint:document.getElementById("hint").textContent,toast:document.getElementById("toast").innerText})')
    zh=await g(); await pg.screenshot(path=OUT+'/evidence/L-zh-night-0542.png')
    await pg.keyboard.press('l'); await pg.evaluate('tick(1/12)'); en=await g(); await pg.screenshot(path=OUT+'/evidence/L-en-night-0542.png')
    await pg.keyboard.press('l'); await pg.evaluate('tick(1/12)'); zh2=await g()
    print(json.dumps({'zh':zh,'en':en,'zh2':zh2,'pe':pe},ensure_ascii=False,indent=1))
    await b.close()
asyncio.run(main())
