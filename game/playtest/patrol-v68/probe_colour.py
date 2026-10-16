import asyncio,json
from playwright.async_api import async_playwright
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=await b.new_page();await pg.goto('http://127.0.0.1:8834/play/index.html?capture&cycle=48&nosave');await pg.wait_for_function('window.ready',timeout=90000)
    await pg.evaluate('tick(0.1)')
    print(await pg.evaluate('''(()=>{const o={MC:window.MARKER_COLOR||null};for(const k in roofMarkers){const r=roofMarkers[k];let c=null;try{c='#'+r.light.material.userData.u.uCol.value.getHexString()}catch(e){c=String(e)};o[k]={kind:r.kind,col:c,scale:r.group.scale.x}};return JSON.stringify(o)})()'''))
    await b.close()
asyncio.run(m())
