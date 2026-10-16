# test-only: injects stub roof markers (not in game.js) and screenshots night 2 + a hint frame
import asyncio
from playwright.async_api import async_playwright
OUT='/workspace/game-messenger/art/markers/'
INJ='''(async()=>{const THREE=await import('three');const sc=window.__dnScene;const hs=[];sc.traverse(o=>{if(o.userData.person)hs.push(o)});
window.roofMarkers={};for(const h of hs){const b=new THREE.Box3().setFromObject(h);const up=h.getWorldPosition(new THREE.Vector3()).normalize();
 const m=new THREE.Mesh(new THREE.SphereGeometry(0.3,16,12),new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{uCol:{value:new THREE.Color()},uOn:{value:0}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 uCol;uniform float uOn;layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;void main(){o0=vec4(uCol*min(uOn,2.5),1.);o1=vec4(0.);}'}));m.position.copy(h.worldToLocal(up.clone().multiplyScalar(b.getCenter(new THREE.Vector3()).length()+b.getSize(new THREE.Vector3()).length()*0.45)));
 const L=new THREE.PointLight(0xffffff,3,4);m.add(L);h.add(m);window.roofMarkers[h.userData.person.name.zh]={light:m};window.roofMarkers['L_'+h.userData.person.name.zh]={light:L,name:h.userData.person.name.zh};}
return hs.map(h=>h.userData.person.name.zh)})()'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/home/box/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx=await b.new_context(viewport={'width':960,'height':600});await ctx.add_init_script('window.__dnDebug=1')
    pg=await ctx.new_page();pg.on('pageerror',lambda e:print('PAGEERROR',e));pg.on('console',lambda m:print('CON',m.text) if m.type in('warning','error') else None)
    await pg.goto('http://localhost:8834/play/index.html?capture&cycle=36&nosave'); await pg.wait_for_function('window.ready',timeout=60000)
    await pg.evaluate('__force({night:1})');await pg.evaluate('skipTo(2.0)');await pg.evaluate('tick(1/12)')
    print('target0',await pg.evaluate("(window.state&&state.targets&&state.targets[0]&&state.targets[0].userData.person)?state.targets[0].userData.person.name.zh:'?'"));print("real markers",await pg.evaluate("Object.keys(roofMarkers).join()"))
    await pg.evaluate('debugAtHer(7,true)')
    for _ in range(24): await pg.evaluate('tick(1/12)')
    print(await pg.evaluate('JSON.stringify(Object.entries(roofMarkers).map(([k,e])=>[k,+e.light.material.userData.u.uGlow.value.toFixed(2),e.group.visible]))'))
    await pg.screenshot(path=OUT+'xm_before.jpg',type='jpeg',quality=88)
    await pg.evaluate("onHintLevel1('小满')")
    for i in range(6):
      await pg.wait_for_timeout(270);await pg.evaluate('tick(1/12)')
      print(await pg.evaluate("roofMarkers['小满'].light.material.userData.u.uGlow.value.toFixed(2)"))
    await pg.screenshot(path=OUT+'xm_hint.jpg',type='jpeg',quality=88)
    await pg.wait_for_timeout(3000);await pg.evaluate('tick(1/12)')
    print('after timeout',await pg.evaluate("roofMarkers['小满'].light.material.userData.u.uGlow.value.toFixed(2)"))
    await b.close()
asyncio.run(main())
