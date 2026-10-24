// Paper Echo · tiny-planet courier prototype (original code; no Abeto assets).
// Look: MRT G-buffer -> screen-space outline B (thick, world-noise gaps) -> LUT A (warm teal/cream) -> window glow (Ìtùtù method B).
import * as THREE from 'three';
import { createNightProgress, KEEPSAKES } from './nightProgress.js'; // àṣẹ's module (copied from playable-ase/)
const Q=new URLSearchParams(location.search);
const M=+(Q.get('m')||3), CAPTURE=Q.has('capture'), FIXPAL=Q.get('palette'), GLOW=parseFloat(Q.get('glow')??'1.2'), CYCLE=parseFloat(Q.get('cycle')||'240');
let LANG=Q.get('lang')||'zh';
const W=innerWidth||1280,H=innerHeight||800;
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(50,W/H,0.3,120);

// ---------- palettes (Ìtùtù, 16x16, slot = row*16+col) ----------
async function loadPal(url){const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,16,16).data;}
const PALS=await Promise.all(['day','dusk','night'].map(n=>loadPal(`../palettes/palette-${n}.png?${Date.now()}`)));
// Ìtùtù's day/night module (repro/play/daynight.js, applyTimeOfDay(scene,tod) tod 0..2). Used when present; built-in fallback otherwise.
let npBack=null;let OCC=null;try{OCC=await import('./occlusion.js');}catch(e){console.log('occlusion.js not present yet');}
let DN=null;try{DN=await import('./daynight.js');}catch(e){console.log('daynight.js not present, using built-in TOD');}
// house-kit preview (opt-in): ?kit=<name> loads ../assets/<name>/kit.json {files:[...glb]} and swaps every house except herHouse for those models (see swapHousesToKit). No param = procedural houses, unchanged.
const KIT=/^[a-z0-9_-]+$/.test(Q.get('kit')||'')?Q.get('kit'):null;let KITS=null;
if(KIT){try{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const man=await (await fetch(`../assets/${KIT}/kit.json`)).json();const L=new GLTFLoader();KITS=await Promise.all(man.files.map(f=>L.loadAsync(`../assets/${KIT}/${f}`).then(g=>g.scene)));}catch(e){console.warn('kit',KIT,'failed to load; keeping procedural houses',e);KITS=null;}}
const TODQ=Q.get('tod');
let PH=TODQ!==null&&TODQ!=='auto'?parseFloat(TODQ):FIXPAL?({day:0,dusk:1,night:2}[FIXPAL]??0):0; // 0 day,1 dusk,2 night, wraps at 3
// time-of-day logic ported from Ìtùtù's art/palette-test/main.js (setTod): PH 0..2 day->dusk->night, 2..3 night->day
const ss=(a,b,x)=>{x=Math.min(Math.max((x-a)/(b-a),0),1);return x*x*(3-2*x);};
const todT=ph=>ph<=2?ph:2-(ph-2)*2;
function palRGB(slot,ph=PH){const t=todT(ph);const i=slot*4;const c=k=>[0,1,2].map(j=>PALS[k][i+j]/255);const a=c(0),b=c(1),n=c(2);
 return t<1?a.map((v,j)=>v+(b[j]-v)*ss(0,1,t)):b.map((v,j)=>v+(n[j]-v)*ss(1,2,t));}
const BH_TOP=[0.16,0.25,0.55],BH_HOR=[0.42,0.45,0.72];const SWITCH=[];
const reg=[];function regColor(color,slot){reg.push({color,slot});}
function updatePalette(){for(const r of reg){const c=palRGB(r.slot);r.color.setRGB(c[0],c[1],c[2],THREE.SRGBColorSpace);}}
const S={grass:0,grass_light:1,rock:5,wall:[16,17,18],roof:[19,20,21,22],door:23,glass:24,frame:25,chimney:26,fence:27,trunk:32,leaf:[33,34,35,39],
 coat:48,scarf:49,skin:50,boots:51,bag:52,envelope:53,hat:54,winlight:64,lamp:65,lampmetal:66,skytop:80,skyhor:81,cloud:84,outline:85,hemisky:86,hemignd:87,sun:88};

// ---------- lights ----------
const sun=new THREE.DirectionalLight(0xffffff,2.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:60});sun.shadow.bias=-0.0006;
const hemi=new THREE.HemisphereLight(0xffffff,0x444444,0.5);scene.add(sun,sun.target,hemi);
regColor(sun.color,S.sun);regColor(hemi.color,S.hemisky);regColor(hemi.groundColor,S.hemignd);

// ---------- materials ----------
const common=`
vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}
vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
float h3(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec2 encN(vec3 n){float p=sqrt(n.z*8.+8.);return n.xy/p+.5;}`;
const G={uNight:{value:0},uWarm:{value:new THREE.Color('#ffcf6a')},uShade:{value:new THREE.Color(1,1,1)}}; // uShade: shadow tint = sky-top colour normalised (cool by day, violet at dusk, navy at night)
let idk=0;const nextId=()=>{idk++;return 0.05+((idk*0.61803)%1)*0.9;};
// kind: 0 plain,1 ground,2 rock stripes,3 leaf clumps,4 window,5 marker(always lit)
function toon(slot,{kind=0,id=nextId(),gap=0.32,side=THREE.FrontSide,hex=null}={}){
  const m=new THREE.MeshLambertMaterial({side});
  if(hex!=null)m.color.set(hex);else regColor(m.color,slot);
  const u={uGlow:{value:0},uLit:{value:0},uOn:{value:0},uDim:{value:0},uCol:{value:new THREE.Color(1,1,1)},uUseCol:{value:0}};m.userData.u=u;
  m.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{uId:{value:id},uKind:{value:kind},uGap:{value:gap},uNight:G.uNight,uWarm:G.uWarm,uShade:G.uShade,uGlow:u.uGlow,uLit:u.uLit,uOn:u.uOn,uDim:u.uDim,uCol:u.uCol,uUseCol:u.uUseCol});
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vW;varying vec3 vNv;varying vec2 vZW;')
      .replace('#include <project_vertex>',`#include <project_vertex>
      vec4 wp=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      wp=instanceMatrix*wp;
      #endif
      vW=(modelMatrix*wp).xyz;vNv=normalize(transformedNormal);vZW=gl_Position.zw;`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float uId,uGap,uNight,uGlow,uLit,uOn,uDim,uUseCol;uniform vec3 uWarm,uCol,uShade;uniform int uKind;varying vec3 vW;varying vec3 vNv;varying vec2 vZW;layout(location=1) out vec4 gInfo;${common}`)
      .replace('#include <opaque_fragment>',`
      float L=reflectedLight.directDiffuse.r;
      vec3 base=diffuseColor.rgb;float sid=uId;base*=mix(vec3(1.),vec3(.40,.45,.56),uDim*uNight);
      float nB=vnoise(vW*7.1);
      if(uKind==1){float p=step(0.58,vnoise(vW*0.9));base*=mix(1.0,1.08,p);base*=0.94+0.12*vnoise(vW*5.);} // calm: tone only, no id lines
      if(uKind==2){float st=step(0.5,fract(length(vW)*2.6+vnoise(vW*1.5)*0.8));sid+=st*0.06;base*=mix(1.0,0.86,st);}
      if(uKind==3){float lobe=floor(vnoise(vW*2.4+uId*5.)*3.);L+=(lobe-1.)*0.12; /* lobes are tone only now; their id lines made every canopy a scribble. Clumps still ink where blobs meet */base*=(0.95+lobe*0.05)*(0.92+0.16*nB);}
      vec3 hs=rgb2hsv(base);hs.x+=-0.03;hs.y=min(1.,hs.y*1.12);hs.z*=0.64;vec3 shade=hsv2rgb(hs)*mix(vec3(1.),uShade,0.38); // lighter, sky-tinted shadow side (was a flat 52% darken): forms read, nothing goes muddy
      vec3 col=mix(shade,base,smoothstep(0.18,0.32,L));
      col+=smoothstep(0.01,0.012,reflectedLight.directSpecular.r)*0.05;
      col+=reflectedLight.indirectDiffuse*0.18;
      if(uKind==7)col=base; // flat unlit (keepsake silhouettes)
      if(uDim>0.5)col=max(col,(diffuseColor.rgb*0.32+vec3(0.04,0.05,0.09))*uNight); // v6: night floor so no house reads as a pure black silhouette
      bool light=false;
      if(uKind==6){float on=max(uOn,uLit);col=mix(col,uWarm*1.6,on);light=on>0.5;}
      if(uKind==4){float on=max(uOn,uLit);col=mix(col,uWarm*1.8,on);light=on>0.5;}
      if(uKind==5){col=mix(uWarm,uCol,uUseCol)*2.2*(1.-0.3*uNight);light=true;} /* roof markers (uUseCol=1) use their own colour uCol; other kind-5 lamps keep uWarm */
      col+=uWarm*uGlow*0.9;
      float oc=step(uGap,vnoise(vW*2.7+uId*7.3)*0.75+vnoise(vW*9.)*0.35);
      if(uKind>=4)oc=1.;
      gl_FragColor=vec4(col,light?-sid:sid); // negative alpha = glow source (Ìtùtù method)
      gInfo=vec4(1.-(0.5*vZW.x/vZW.y+0.5),encN(normalize(vNv)),oc);`);
  };
  return m;
}

// ---------- world ----------
const R=8;const planet=new THREE.Group();scene.add(planet);
const GROUND_ID=nextId(); // ground and grass blades share one surface id, so blades never get id outlines (they read as ground texture, not debris)
let rnd=11;const rand=()=>((rnd=(rnd*16807)%2147483647)/2147483647);const pick=a=>a[Math.floor(rand()*a.length)];
const UP=new THREE.Vector3(0,1,0);
const hgt=v=>Math.sin(v.x*.7)*Math.cos(v.z*.6)*0.12+Math.sin(v.y*1.3+v.x)*0.08;
const surf=d=>R+hgt(d.clone().multiplyScalar(R));
{const pg=new THREE.IcosahedronGeometry(R,40);const p=pg.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);v.setLength(R+hgt(v));p.setXYZ(i,v.x,v.y,v.z)}pg.computeVertexNormals();
 const g=new THREE.Mesh(pg,toon(S.grass,{kind:1,gap:0.55,id:GROUND_ID}));g.receiveShadow=true;planet.add(g);}
const START=new THREE.Vector3(0,1,0);
const usedDirs=[START.clone()];const obstacles=[];
function randDir(minAng=0){for(let k=0;k<300;k++){const d=new THREE.Vector3(rand()*2-1,rand()*2-1,rand()*2-1);if(d.lengthSq()>1||d.lengthSq()<.01)continue;d.normalize();if(usedDirs.every(u=>u.angleTo(d)>minAng)){if(minAng)usedDirs.push(d);return d}}return new THREE.Vector3(1,0,0)}
function place(obj,dir,sink=0.05,col=0){obj.position.copy(dir).multiplyScalar(surf(dir)-sink);obj.quaternion.setFromUnitVectors(UP,dir);obj.rotateY(rand()*6.28);planet.add(obj);
 obj.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true}});if(col)obstacles.push({dir:dir.clone(),rad:col/R});return obj}
function gable(w,d,h,mat){const s=new THREE.Shape();s.moveTo(-w/2-0.08,0);s.lineTo(0,h);s.lineTo(w/2+0.08,0);s.lineTo(-w/2-0.08,0);
 const g=new THREE.ExtrudeGeometry(s,{depth:d+0.16,bevelEnabled:false});g.translate(0,0,-(d+0.16)/2);return new THREE.Mesh(g,mat)}
const houses=[];
function house(){const g=new THREE.Group();const w=1.0+rand()*0.6,d=0.9+rand()*0.4,h=0.8+rand()*0.6;const mats=[];const T=(s,o)=>{const m=toon(s,o);mats.push(m);return m};
 const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),T(pick(S.wall)));b.position.y=h/2;g.add(b);
 const rh=0.5+rand()*0.3;const r=gable(w,d,rh,T(pick(S.roof)));r.position.y=h;g.add(r);
 const dr=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.44,0.04),T(S.door));dr.position.set(-w*0.25,0.22,d/2+0.01);g.add(dr);
 const win=T(S.glass,{kind:4});SWITCH.push(win);win.name='window';
 for(const sx of [0.22,-0.05]){if(sx<0&&w<1.3)continue;const wi=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.22,0.04),win);wi.name='window';wi.position.set(w*sx+0.1,h*0.6,d/2+0.01);g.add(wi)}
 for(const sg of [1,-1]){const ws=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.22,0.2),win);ws.name='window';ws.position.set(sg*(w/2+0.01),h*0.6,0);g.add(ws)}
 const wb=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.22,0.04),win);wb.name='window';wb.position.set(0,h*0.6,-d/2-0.01);g.add(wb);
 if(rand()<0.6){const c=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.45,0.14),T(S.chimney));c.position.set(w*0.25,h+0.35,0.1);g.add(c)}
 if(rand()<0.5){const fm=T(S.fence);for(let i=0;i<6;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.22,0.04),fm);p.position.set(-w/2+i*w/5,0.11,d/2+0.4);g.add(p)}
  const rl=new THREE.Mesh(new THREE.BoxGeometry(w,0.03,0.03),fm);rl.position.set(0,0.17,d/2+0.4);g.add(rl)}
 g.userData={mats,win,top:h+rh,size:Math.max(w,d),w,h,d};return g}
function canopy(size,slot){const g=new THREE.Group();const cm=toon(slot,{kind:3}); /* one material = one outline id per canopy: the tree inks as one mass, blobs still separate by depth/normal edges */for(let i=0;i<5;i++){const s=new THREE.Mesh(new THREE.IcosahedronGeometry(size*0.62,3),cm);
 const a=i/5*6.28;s.position.set(Math.cos(a)*size*0.45,(i%2)*size*0.35-0.1,Math.sin(a)*size*0.45);if(i==4)s.position.set(0,size*0.55,0);s.scale.y=1.1;g.add(s)}return g}
function tree(){const g=new THREE.Group();const s=0.5+rand()*0.35;const t=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.11,0.9,6),toon(S.trunk));t.position.y=0.45;g.add(t);
 const c=canopy(s,pick(S.leaf));c.position.y=0.85+s*0.8;g.add(c);return g}
function bush(){const g=new THREE.Group();const c=canopy(0.25+rand()*0.15,pick(S.leaf));c.position.y=0.15;g.add(c);return g}
for(let i=0;i<18;i++){const d=randDir(0.36);const h=house();place(h,d,0.05,h.userData.size*0.62);h.userData.dir=d;houses.push(h);}
houses.forEach((h,i)=>{h.userData.obs=obstacles[i];});
// v5 progression: one district (around the house farthest from START) is roped off until day 2
const AREA=houses.reduce((a,h)=>h.userData.dir.angleTo(START)>a.userData.dir.angleTo(START)?h:a).userData.dir.clone();const AREA_R=0.78;
const inArea=d=>d.angleTo(AREA)<AREA_R;let areaOpen=false;const closedProps=[];
const closedHouses=houses.filter(h=>inArea(h.userData.dir));closedHouses.forEach(h=>{h.visible=false;h.userData.obs.off=true;closedProps.push(h);});
const RECIP=[...houses].filter(h=>!inArea(h.userData.dir)).sort((a,b)=>a.userData.dir.angleTo(START)-b.userData.dir.angleTo(START)).filter(h=>h.userData.dir.angleTo(START)>0.45).filter((h,i)=>i%2===0).slice(0,4);
const zhouHouse=closedHouses.reduce((a,h)=>h.userData.dir.angleTo(AREA)<a.userData.dir.angleTo(AREA)?h:a);
function nearDir(c,maxA,minA=0){for(let k=0;k<200;k++){const ax=new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).cross(c).normalize();const d=c.clone().applyAxisAngle(ax,minA+rand()*(maxA-minA)).normalize();if(usedDirs.every(u=>u.angleTo(d)>0.12)){usedDirs.push(d);return d;}}return c.clone();}
for(const h of houses)h.traverse(o=>{if(o.name==='window')o.userData.noOcclude=true;}); // windows keep their own lit material even while occlusion.js swaps a house's materials
for(const h of houses)h.traverse(o=>{if(o.isMesh&&o.material&&o.material.userData.u&&o.name!=='window'&&o.material!==h.userData.win)o.material.userData.u.uDim.value=1;});
// Itutu night lighting: soft ground ring per house + pool of 6 warm PointLights on the nearest lit windows
const ringTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const gr=x.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(255,207,106,1)');gr.addColorStop(0.6,'rgba(255,207,106,.5)');gr.addColorStop(1,'rgba(255,207,106,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
for(const h of houses){const m=new THREE.Mesh(new THREE.PlaneGeometry(3.2,3.2),new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{map:{value:ringTex},opacity:{value:0}},transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
 vertexShader:'out vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'precision highp float;in vec2 vU;uniform sampler2D map;uniform float opacity;layout(location=0) out vec4 o;layout(location=1) out vec4 gi;void main(){vec4 t=texture(map,vU);o=vec4(t.rgb*t.a*opacity,0.);gi=vec4(0.);}'}));m.rotation.x=-Math.PI/2;m.position.y=0.04;m.userData.noOcclude=true;h.add(m);h.userData.gRing=m;}
const LSCALE=parseFloat(Q.get("wl")??"1");const winLights=[];for(let i=0;i<6;i++){const L=new THREE.PointLight(0xffcf6a,0,5,2.0);scene.add(L);winLights.push(L);}
function updateNightLights(){const nt=G.uNight.value;const hp=hero.getWorldPosition(new THREE.Vector3());const lit=[];
 for(const h of houses){const u=h.userData.win&&h.userData.win.userData.u;const on=u?Math.max(u.uOn.value,u.uLit.value):0;h.userData.gRing.material.uniforms.opacity.value=0.09*on*nt;if(on*nt>0.05)lit.push([h.getWorldPosition(new THREE.Vector3()).distanceTo(hp),h,on*nt]);}
 lit.sort((a,b)=>a[0]-b[0]);winLights.forEach((L,i)=>{const e=lit[i];if(!e){L.intensity=0;return;}const h=e[1];L.position.copy(h.localToWorld(new THREE.Vector3(0,h.userData.size*0.3,h.userData.size*0.62+1.1)));L.intensity=0.9*LSCALE*e[2];});}

const treeList=[];for(let i=0;i<45;i++){const td=randDir(0.14);const t=place(tree(),td,0.05,0.18);t.userData.s=t.children[1].position.y;t.userData.isTree=true;treeList.push(t);}
for(let i=0;i<40;i++)place(bush(),randDir(0.09));
for(let i=0;i<12;i++){const s=0.3+rand()*0.5;place(new THREE.Mesh(new THREE.DodecahedronGeometry(s,1),toon(S.rock,{kind:2})),randDir(0.15),0.15,s*0.8)}
{const poles=[];const pm=toon(S.lampmetal);const lampDirs=[];for(let i=0;i<10;i++)lampDirs.push(randDir(0.2));
 // v4: a streetlight beside every house so the walking route has warm focal points at night
 for(const h of houses){const d=h.userData.dir;const ax=new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).cross(d).normalize();lampDirs.push(d.clone().applyAxisAngle(ax,(h.userData.size*0.7+1.3)/R).normalize());}
 // v5: lamps at ~2.6m intervals along the walking routes START -> recipients -> the well district
 {const route=[START,...RECIP.map(h=>h.userData.dir),zhouHouse.userData.dir];for(let r=0;r<route.length-1;r++){const a=route[r],b=route[r+1];const ang=a.angleTo(b);const n=Math.floor(ang*R/2.6);const ax=new THREE.Vector3().crossVectors(a,b).normalize();
  for(let k=1;k<n;k++){const d=a.clone().applyAxisAngle(ax,ang*k/n).applyAxisAngle(new THREE.Vector3().crossVectors(ax,a).normalize(),0).normalize();const side=new THREE.Vector3().crossVectors(d,ax).normalize();d.addScaledVector(ax,(k%2?1:-1)*0.7/R).normalize();
   if(houses.every(h=>h.userData.dir.angleTo(d)*R>h.userData.size*0.8+0.4))lampDirs.push(d);}}}
 for(let i=0;i<lampDirs.length;i++){const d=lampDirs[i];const p=new THREE.Group();const c=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.045,1.8,5),pm);c.name='lamp_pole';c.position.y=0.9;p.add(c);
  const cr=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.04,0.04),pm);cr.name='lamp_pole_arm';cr.position.y=1.7;p.add(cr);
  const lm=toon(S.lamp,{kind:6});SWITCH.push(lm);const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.12,0.14),lm);lamp.name='lamp_head';lamp.position.set(0.18,1.6,0);p.add(lamp);
  place(p,d,0.05,0.12);if(inArea(d)){p.visible=false;closedProps.push(p);}else p.updateMatrixWorld(true);poles.push(p.localToWorld(new THREE.Vector3(0,1.7,0)))}
 const wm=toon(S.outline,{gap:0});
 const pvis=poles.map(q=>!inArea(q.clone().normalize()));
 for(let i=0;i<poles.length;i++){if(!pvis[i])continue;let best=-1,bd=1e9;for(let j=0;j<poles.length;j++){if(j===i||!pvis[j])continue;const dd=poles[i].distanceTo(poles[j]);if(dd<bd&&dd<6.5){bd=dd;best=j}}
  if(best<0)continue;const a=poles[i],b=poles[best];const pts=[];for(let k=0;k<=12;k++){const t=k/12;const p=a.clone().lerp(b,t);p.add(p.clone().normalize().multiplyScalar(-Math.sin(t*Math.PI)*0.25));pts.push(p)}
  planet.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,0.012,4),wm))}}
{const tg=new THREE.ConeGeometry(0.035,0.22,3);tg.translate(0,0.11,0);const N=1800;const im=new THREE.InstancedMesh(tg,toon(S.grass_light,{gap:2,id:GROUND_ID}),N);const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();
 for(let i=0;i<N;i++){const d=randDir();q.setFromUnitVectors(UP,d);e.set((rand()-.5)*0.6,rand()*6,(rand()-.5)*0.6);q.multiply(new THREE.Quaternion().setFromEuler(e));const s=0.6+rand()*0.9;m.compose(d.clone().multiplyScalar(surf(d)-0.02),q,new THREE.Vector3(s,s,s));im.setMatrixAt(i,m)}
 im.receiveShadow=true;planet.add(im);}

// ---------- courier ----------
const hero=new THREE.Group();const heroLegs=[];const heroArms=[];
{const add=(geo,slot,p,o={})=>{const m=new THREE.Mesh(geo,toon(slot,{gap:0,...o}));m.position.set(...p);m.castShadow=true;hero.add(m);return m};
 add(new THREE.CapsuleGeometry(0.2,0.3,4,10),S.coat,[0,0.58,0]);              // raincoat
 add(new THREE.TorusGeometry(0.15,0.05,6,12),S.scarf,[0,0.82,0]).rotation.x=Math.PI/2;
 add(new THREE.SphereGeometry(0.2,14,12),S.skin,[0,1.02,0]);                    // head
 add(new THREE.SphereGeometry(0.215,14,12,0,6.3,0,1.5),S.hat,[0,1.06,-0.01]);   // hood/hat
 add(new THREE.CylinderGeometry(0.26,0.26,0.03,14),S.hat,[0,1.1,0.02]);         // brim
 add(new THREE.SphereGeometry(0.03,6,6),S.outline,[-0.07,1.02,0.18],{hex:0x202428});add(new THREE.SphereGeometry(0.03,6,6),S.outline,[0.07,1.02,0.18],{hex:0x202428});
 add(new THREE.BoxGeometry(0.28,0.24,0.12),S.bag,[0.2,0.5,-0.12]).rotation.z=0.2;  // satchel
 add(new THREE.BoxGeometry(0.2,0.12,0.02),S.envelope,[0.24,0.62,-0.06]).rotation.z=0.2;
 for(const sx of [-1,1]){const l=add(new THREE.CylinderGeometry(0.06,0.06,0.32,6),S.boots,[sx*0.09,0.16,0]);l.geometry.translate(0,-0.16,0);l.position.y=0.34;heroLegs.push(l);
  const a=add(new THREE.CapsuleGeometry(0.05,0.2,3,6),S.coat,[sx*0.25,0.62,0]);a.geometry.translate(0,-0.12,0);a.position.y=0.74;heroArms.push(a);}
 scene.add(hero);}
// recipients: each has a small fixation; line changes on each visit (night). Original copy.
// recipients (àṣẹ v0.1, VOICE v2): 5 people x 3 nights; 老周 night 3 uses 3b
const visits=new Map();
const PEOPLE=[
 {name:{zh:'小满',en:'Xiaoman'},zh:['三百一十二颗，我数了两遍。……第二遍是三百零九。','昨晚少的那三颗，我找到了，躲在云后面。……今晚云更厚了，算了。','送你一颗，我折的，算在我的总数里。……所以今晚是三百一十一颗。'],
  en:["312 stars tonight, counted twice. …The second time was 309. Don't tell anyone.","Found last night's missing three behind a cloud. …Thicker cloud tonight. Oh well.","Have one, I folded it. It still counts toward my total. …So tonight is 311."]},
 {name:{zh:'老周',en:'Old Zhou'},zh:['终于来了，我等这封信等了整整一个冬天。……啊，是电费单。那也行，谢谢你。','你真敲了两下。……我在门后数着呢，你差点敲成三下。'],
  en:["Finally. I've waited all winter for this. …Ah. The electric bill. Fine. Thanks anyway.","You actually knocked twice. …I was counting behind the door. You almost made it three."]},
 {name:{zh:'阿汀',en:'Ting'},zh:['第一百只船，它回来了！……好吧，第九十九只。','我在船底写了我的地址，这样它就知道回家的路。……写反了，它可能去了你家。','上次写反地址那只，真漂到你那儿了吧？今晚这只我留着。……主要是外面下雨，纸会软。'],
  en:["My hundredth boat came back! …Fine, it's the ninety-ninth. The wind brought it back.","I wrote my address on the bottom so it knows the way home. …Upside down. It may have gone to yours.","Did that upside-down one really float to you? I'm keeping this one. …Mostly 'cause it's raining."]},
 {name:{zh:'米婆婆',en:'Granny Mi'},zh:['这盆叫春生，那盆叫秋生，那盆……也叫秋生。','那盆叫秋生的，我改名了，免得两盆吵架。……现在两盆都叫春生。','春生和春生都开花了，送你一盆。……它叫邮差，我刚起的，这个我记得住。'],
  en:["This one's Spring, that one's Autumn, and that one… also Autumn. I forgot.","I renamed the other Autumn so they won't fight. …Now they're both Spring.","Spring and Spring both bloomed, take one. …It's called Postman. Just named it. That one I'll remember."]},
 {name:{zh:'豆豆',en:'Doudou'},zh:['这是我写的第一封信，「亲爱的」后面要空两格吗？……我先空着，等想好写给谁。','昨天那封我写完了，写给你的。……就是只有「亲爱的邮差」五个字，后面还在想。','今晚你不用送了，这封是给你的，从门缝里塞出来。……你别当面拆，我会脸红。'],
  en:['My first letter ever. Comma after "Dear"? …I\'ll leave it blank till I know who.','I finished yesterday\'s letter — it\'s for you. …It says "Dear Postman" and that\'s it so far.',"No delivery tonight — this one's for you, out through the door crack. …Don't open it in front of me."]},
];
// ---- àṣẹ's nightProgress on one recurring house ("her house"): keepsake per night + one more fence lamp per finished night ----
const PBY=n=>PEOPLE.find(p=>p.name.zh===n);
['小满','米婆婆','阿汀','豆豆'].forEach((n,i)=>RECIP[i].userData.person=PBY(n));zhouHouse.userData.person=PBY('老周');
const HOF=n=>n==='老周'?zhouHouse:RECIP.find(h=>h.userData.person.name.zh===n);
// nightly plan: night1 = 3 letters; night2 = new recipient (老周) in the newly opened well district; night3 = 老周's knock (seeded by his night-2 reply) + 豆豆 for the first time
const PLAN=[[['小满'],['阿汀'],['米婆婆']],[['老周'],['阿汀'],['小满'],['米婆婆']],[['老周','knock'],['豆豆'],['阿汀'],['米婆婆'],['小满']]];
const CRANE_CAP=[3,6,10];const herHouse=RECIP[2];herHouse.name='herHouse';{const i=SWITCH.indexOf(herHouse.userData.win);if(i>=0)SWITCH.splice(i,1);}
// host house: rebuild the front wall with a real window hole so the room behind is visible
{const u=herHouse.userData;const body=herHouse.children[0];const wm=body.material;herHouse.remove(body);
 const wx=u.w*0.22,wy=u.h*0.6,ww=0.42,wh=0.34,t=0.06;const add=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wm);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;herHouse.add(m);};
 add(u.w,u.h,t,0,u.h/2,-u.d/2+t/2);add(t,u.h,u.d,-u.w/2+t/2,u.h/2,0);add(t,u.h,u.d,u.w/2-t/2,u.h/2,0);add(u.w,0.03,u.d,0,0.015,0);add(u.w,0.03,u.d,0,u.h-0.015,0);
 const L=wx-ww/2+u.w/2,Rr=u.w/2-(wx+ww/2);add(L,u.h,t,-u.w/2+L/2,u.h/2,u.d/2-t/2);add(Rr,u.h,t,u.w/2-Rr/2,u.h/2,u.d/2-t/2);
 add(ww,wy-wh/2,t,wx,(wy-wh/2)/2,u.d/2-t/2);add(ww,u.h-(wy+wh/2),t,wx,(wy+wh/2+u.h)/2,u.d/2-t/2);
 herHouse.children.filter(c=>c.material===u.win&&c.position.z>u.d/2-0.05&&Math.abs(c.position.x-wx)<0.4).forEach(c=>herHouse.remove(c));
 u.npWin={x:wx,y:wy,w:ww,h:wh};}
// ?kit=: replace each house's procedural meshes with a kit model, keeping the house Group, its footprint (colliders, lamps, rings already placed) and the userData contract (win/mats/top).
// Kit material NAME = role (wall, roof, trim, door, window, chimney, stone, wood, metal, cloth, plant, paper) -> palette slot; 'window' faces become the house's switchable window.
// Runs after herHouse is chosen and rebuilt, so herHouse (window hole, room, keepsakes) stays procedural. Builds the procedural houses first, so rand() and the layout are unchanged.
if(KITS){const ROLE={wall:k=>S.wall[k%3],roof:k=>S.roof[k%4],door:()=>S.door,trim:()=>S.frame,frame:()=>S.frame,chimney:()=>S.chimney,fence:()=>S.fence,stone:()=>S.rock,wood:()=>S.trunk,metal:()=>S.lampmetal,cloth:()=>S.scarf,plant:()=>S.leaf[0],paper:()=>S.envelope,glass:()=>S.glass};
 const roleOf=m=>(m&&m.name||'wall').toLowerCase().replace(/^pal_\d+_*/,'').split(/[_.\d]/).filter(Boolean)[0]||'wall';
 houses.forEach((h,hi)=>{if(h===herHouse)return;const u=h.userData;
  for(const c of [...h.children]){if(c!==u.gRing)h.remove(c);}
  {const i=SWITCH.indexOf(u.win);if(i>=0)SWITCH.splice(i,1);}
  const model=KITS[hi%KITS.length].clone(true);const ci=hi+Math.floor(hi/KITS.length); // every variant gets used evenly (a fixed-stride hash hit only 3 of 6); ci shifts wall/roof colours so a variant isn't always the same colour
  const bb=new THREE.Box3().setFromObject(model);model.scale.setScalar(Math.min(u.w/(bb.max.x-bb.min.x),u.d/(bb.max.z-bb.min.z))*1.15);
  const win=toon(S.glass,{kind:4});win.name='window';SWITCH.push(win);const cache={};const mats=[];
  model.traverse(o=>{if(!o.isMesh)return;const r=roleOf(o.material);o.castShadow=o.receiveShadow=true;
   if(r==='window'){o.material=win;o.name='window';o.userData.noOcclude=true;return;}
   if(!cache[r]){cache[r]=toon((ROLE[r]||ROLE.wall)(ci+(r==='roof'?1:0)));cache[r].userData.u.uDim.value=1;mats.push(cache[r]);}o.material=cache[r];}); // one material per role per house = one outline id per role
  h.add(model);const b2=new THREE.Box3().setFromObject(model);u.top=b2.max.y-b2.min.y;u.win=win;u.mats=mats;});}
// well beside 老周's house + paper-ribbon rope around the closed district
{const z=zhouHouse.userData;const wd=nearDir(z.dir,(z.size*0.7+1.0)/R,(z.size*0.7+0.8)/R);const w=new THREE.Group();const st=toon(S.rock,{kind:2});
 const ring=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.36,0.36,10,1,true),st);ring.position.y=0.18;w.add(ring);ring.material.side=THREE.DoubleSide;
 const wat=new THREE.Mesh(new THREE.CircleGeometry(0.3,10),toon(S.glass));wat.rotation.x=-Math.PI/2;wat.position.y=0.12;w.add(wat);
 for(const sx of[-1,1]){const po=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.7,0.05),toon(S.trunk));po.position.set(sx*0.3,0.5,0);w.add(po);}
 const rf=gable(0.7,0.5,0.25,toon(S.roof[1]));rf.position.y=0.85;w.add(rf);place(w,wd,0.03,0.4);zhouHouse.userData.well=w;w.visible=false;closedProps.push(w);obstacles[obstacles.length-1].off=true;w.userData.obs=obstacles[obstacles.length-1];}
const rope=new THREE.Group();planet.add(rope);{const pm=toon(S.fence);const rm=toon(S.envelope,{gap:0});const N=34;const pts=[];const ax0=new THREE.Vector3(1,0,0).cross(AREA).normalize();
 for(let i=0;i<N;i++){const d=AREA.clone().applyAxisAngle(AREA,0);const q=AREA.clone().applyAxisAngle(ax0,AREA_R).applyAxisAngle(AREA,i/N*6.283).normalize();const p=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.5,0.05),pm);p.position.copy(q).multiplyScalar(surf(q)+0.2);p.quaternion.setFromUnitVectors(UP,q);rope.add(p);pts.push(q.clone().multiplyScalar(surf(q)+0.4));}
 rope.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),120,0.015,4,true),rm));
 for(let i=0;i<N;i++){const f=new THREE.Mesh(new THREE.PlaneGeometry(0.12,0.16),toon(i%2?S.scarf:S.envelope,{gap:1,side:THREE.DoubleSide}));f.position.copy(pts[i].clone().lerp(pts[(i+1)%N],0.5)).addScaledVector(pts[i].clone().normalize(),-0.1);f.quaternion.setFromUnitVectors(UP,pts[i].clone().normalize());rope.add(f);}}
let openT=-1;function openArea(){if(areaOpen)return;areaOpen=true;openT=0;for(const o of closedProps){o.visible=true;o.scale.setScalar(0.01);if(o.userData.obs)o.userData.obs.off=false;}
 rope.children.forEach(c=>{if(c.isMesh&&c.geometry.type==='PlaneGeometry')burst(c.getWorldPosition(new THREE.Vector3()),c.position.clone().normalize(),2,0.6);});planet.remove(rope);}
const np=createNightProgress({storageKey:Q.has('nosave')?null:'paper_echo_play_v1',material:hex=>hex===0x373f42?toon(null,{hex,kind:7,gap:1}):toon(null,{hex,gap:1}),glowMaterial:hex=>toon(null,{hex,kind:5})});
if(Q.has('reset'))np.reset();
{const u=herHouse.userData;np.attach(herHouse,{width:u.w,height:u.h,depth:u.d,window:u.npWin,fenceLamps:7});
 np.root.children.forEach(m=>{if(m.userData.base){m.userData.base*=1.2;m.scale.setScalar(m.userData.base);}else if(Math.abs(m.scale.x-1.5)<1e-6)m.scale.setScalar(1.8);}); /* keepsakes 1.5x -> 1.8x (no edit to nightProgress.js) */var KEEP_NOTE={boat:{zh:'「借你家窗台晾一晚。」',en:'"Drying it on your sill tonight."',from:{zh:'阿汀',en:'Ting'}},flower:{zh:'「它叫春生。……也可能叫秋生。」',en:'"This is Spring. …Or Autumn."',from:{zh:'米婆婆',en:'Granny Mi'}},
  cup:{zh:'「泡了两杯，……另一杯是给信的。」',en:'"Made two cups. …One\'s for the letter."',from:{zh:'老周',en:'Old Zhou'}},star:{zh:'「第三百一十二颗。」',en:'"Number 312."',from:{zh:'小满',en:'Xiaoman'}}};
 np.on('lamp',({keepsake})=>{pendingKeep=keepsake;});npBack=null;np.root.traverse(o=>{if(o.isMesh&&o.material.transparent){if(Math.abs(o.position.z+0.3)<0.01){npBack=o;o.material.transparent=false;o.material.depthWrite=true;}o.visible=false;}});window.__npBack=()=>npBack;} // pane/pool: our window glow replaces them (MRT alpha holds surface id)
const P=START.clone(),F=new THREE.Vector3(0,0,1);
{const t=houses.reduce((a,h)=>h.userData.dir.angleTo(P)<a.userData.dir.angleTo(P)?h:a);const g=t.userData.dir.clone().sub(P.clone().multiplyScalar(P.dot(t.userData.dir)));if(g.lengthSq()>1e-6)F.copy(g.normalize());}

// ---------- letters & deliveries (loop adapted from àṣẹ's paper-island quest: carry a line, house window lights up) ----------
const letters=[];const envGeo=new THREE.BoxGeometry(0.42,0.04,0.3),stampGeo=new THREE.BoxGeometry(0.1,0.05,0.1);
function letterOK(d){if(!areaOpen&&d.angleTo(AREA)<AREA_R+0.4/R)return false;if(M>=3&&state.targets.some(h=>d.angleTo(h.userData.dir)*R<4.5))return false; /* never at a recipient's door (letters are unaddressed, so: any open target) */return obstacles.every(o=>o.off||d.angleTo(o.dir)>o.rad+0.35/R);} // v6.1: never spawn inside a house/tree collider or the roped-off district
function spawnLetter(near){let d=randDir();for(let k=0;k<60&&!letterOK(d);k++)d=near?nearDir(near,3/R,1.2/R):randDir();if(near&&!letterOK(d))for(let k=0;k<200&&!letterOK(d);k++)d=randDir();const g=new THREE.Group();g.add(new THREE.Mesh(envGeo,toon(S.envelope,{gap:0})));const st=new THREE.Mesh(stampGeo,toon(S.scarf,{gap:0}));st.position.set(0.12,0.01,-0.07);g.add(st);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.03,6,24),toon(S.lamp,{kind:5}));ring.rotation.x=Math.PI/2;ring.position.y=-0.25;g.add(ring);
 g.userData={dir:d,ph:rand()*6};planet.add(g);letters.push(g);}
const state={carry:0,delivered:0,targets:[],toastT:0,shown:0};
const markers=new Map();
function markHouse(h){const mk=new THREE.Mesh(new THREE.OctahedronGeometry(0.22,0),toon(S.lamp,{kind:5}));h.add(mk);mk.position.y=h.userData.top+0.9;markers.set(h,mk);
 const rr=2.5;const ring=new THREE.Group();{const dm=toon(S.lamp,{kind:5});const dg=new THREE.SphereGeometry(0.035,6,4);for(let i=0;i<28;i++){const a=i/28*6.283;const d=new THREE.Mesh(dg,dm);d.position.set(Math.cos(a)*rr,0.05,Math.sin(a)*rr);ring.add(d);}}h.add(ring);mk.userData.ring=ring;h.userData.win.userData.u.uLit.value=1;state.targets.push(h);}
let nightPlan=null;const plan=()=>PLAN[Math.min(nightN,PLAN.length-1)];const quota=()=>M>=3?(nightPlan||plan()).length:3;
const waitDark=()=>M>=3&&!nightDone&&state.targets.length>0&&!nightOpen()&&PH<0.8;
const nightOpen=()=>M<3||(todT(PH)>=0.8&&PH<2.6); // commissions (letters + 老周 knock) only open at night (HUD says 夜里)
function letterNear(L,c){const ax=new THREE.Vector3();for(let k=0;k<300;k++){ax.set(rand()-.5,rand()-.5,rand()-.5).cross(c).normalize();const d=c.clone().applyAxisAngle(ax,(4+rand()*(k<150?6:10))/R).normalize();if(letterOK(d)&&letters.every(o=>o===L||o.userData.dir.angleTo(d)>1.5/R)){L.userData.dir=d;return true;}}return false;} /* bug 2: reachable letters near the courier, outside colliders */
function pushClear(c0,c1,wp){ /* v6.4: under the dark dip, hide every lamp/prop that is inside the frame AND closer to the camera than her house, sampled along the whole push (wide start -> sill); distant ones stay. Restored when lights-out ends. */
 const v=new THREE.Vector3(),top=new THREE.Vector3();const hide=o=>{if(o.visible){o.visible=false;pushHidden.add(o);}};const cam2=camera.clone();const up=wp.clone().normalize();
 const cands=[];for(const o of planet.children){if(o===herHouse||o.userData.noOcclude||letters.includes(o)||o===fenceNote||!o.visible)continue;if(o.userData.isLamp===undefined){o.userData.isLamp=false;o.traverse(c=>{if(c.name==='lamp_pole')o.userData.isLamp=true;});}cands.push(o);}
 for(let k=0;k<=8;k++){const t=ss(0,1,k/8);cam2.position.copy(c0).lerp(c1,t);cam2.fov=camera.fov*1.15; /* a little wider than the real lens: smoothing/raise drift */cam2.up.copy(up);cam2.lookAt(wp);cam2.updateMatrixWorld();cam2.updateProjectionMatrix();
  const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam2.projectionMatrix,cam2.matrixWorldInverse));const dHouse=cam2.position.distanceTo(wp)-0.8;const baseP=herHouse.localToWorld(new THREE.Vector3(0,0,herHouse.userData.d/2));
  if(k<6){ /* v6.5: wide part of the shot: keep side posts as framing; hide only posts over the subtitle box or right on top of the lens (<4 m / >6% of frame width) */
   const sub=(()=>{const e=$('toast');if(!e)return null;const r=e.getBoundingClientRect();return r.width>0?{x0:r.left/innerWidth*2-1,x1:r.right/innerWidth*2-1,y0:1-r.bottom/innerHeight*2,y1:1-r.top/innerHeight*2}:{x0:-0.45,x1:0.45,y0:-0.9,y1:-0.55};})();
   const tst=(o,h)=>{o.getWorldPosition(v);top.copy(v).addScaledVector(v.clone().normalize(),h);if(!(fr.containsPoint(v)||fr.containsPoint(top)))return;const dc=v.distanceTo(cam2.position);const a=v.clone().project(cam2),b=top.clone().project(cam2);const wpx=0.4/Math.max(0.1,dc)/Math.tan(cam2.fov*Math.PI/360)/cam2.aspect;const ox=Math.min(a.x,b.x)<sub.x1&&Math.max(a.x,b.x)>sub.x0,oy=Math.min(a.y,b.y)<sub.y1&&Math.max(a.y,b.y)>sub.y0;if(dc<4||wpx>0.12||(ox&&oy))hide(o);};
   for(const o of cands){if(o.visible&&o.userData.isLamp)tst(o,1.8);}
   herHouse.traverse(g=>{if(g.visible&&g.isGroup&&g.children.some(c=>c.isPointLight)&&g.children.some(c=>c.geometry&&c.geometry.type==='ConeGeometry'))tst(g,0.7);});continue;}
  for(const o of cands){if(!o.visible)continue;
   if(o.isMesh&&o.geometry&&o.geometry.type==='TubeGeometry'){const pts=o.geometry.parameters.path.getPoints(16);if(pts.some(q=>{v.copy(q).applyMatrix4(o.matrixWorld);return fr.containsPoint(v)&&v.distanceTo(cam2.position)<dHouse;}))hide(o);continue;}
   o.getWorldPosition(v);if(v.length()<1)continue;top.copy(v).addScaledVector(v.clone().normalize(),1.7);
   if((fr.containsPoint(v)&&v.distanceTo(cam2.position)<dHouse)||(fr.containsPoint(top)&&top.distanceTo(cam2.position)<dHouse)){hide(o);continue;}
   if(o.userData.isLamp===undefined){o.userData.isLamp=false;o.traverse(c=>{if(c.name==='lamp_pole')o.userData.isLamp=true;});}
   if(o.userData.isLamp&&v.distanceTo(cam2.position)<12&&(fr.containsPoint(v)||fr.containsPoint(top)))hide(o);} /* lamps that read as foreground (head below her house's base line, or toward the frame edges) go too */
  for(const m of wireLanterns){if(!m.visible)continue;m.getWorldPosition(v);if(fr.containsPoint(v)&&v.distanceTo(cam2.position)<dHouse)hide(m);}
  herHouse.traverse(g=>{if(!g.visible||!g.isGroup)return;const pl=g.children.find(c=>c.isPointLight);if(!pl||!g.children.some(c=>c.geometry&&c.geometry.type==='ConeGeometry')||pl.intensity>0.01)return;g.getWorldPosition(v);if(fr.containsPoint(v)&&v.distanceTo(cam2.position)<cam2.position.distanceTo(baseP)+0.2)hide(g);});}} /* unlit fence posts (dark heads) in front of the sill; lit ones stay */
function guideBeam(L){for(const o of letters)if(o!==L&&o.userData.beam){o.remove(o.userData.beam);o.userData.beam=null;}if(L.userData.beam)return;const b=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,3,12,1,true),pillar.material.clone());b.geometry.translate(0,1.5,0);b.material.uniforms.uOp.value=0.25;b.material.uniforms.uCol.value=new THREE.Color('#ffcf6a');b.userData.noOcclude=true;b.position.y=-0.5;L.add(b);L.userData.beam=b;} /* refilled-letter guide: last-letter beam material, r 0.12, h 3, 0.25, no pulse; goes with the letter on pickup */
function beamNearest(){const vis=letters.filter(l=>l.userData.dir);if(!vis.length)return;guideBeam(vis.reduce((a,b)=>a.userData.dir.angleTo(P)<b.userData.dir.angleTo(P)?a:b));} /* v6.3: the guide beam sits on the letter nearest the courier */
function lettersNeeded(){return state.targets.filter(h=>!h.userData.knock).length;}
function chooseTarget(){if(M<3){const free=RECIP.filter(h=>!state.targets.includes(h)&&!h.userData.doneN);if(free.length&&state.targets.length<3)markHouse(free[0]);return;}}
const carryOver=[];function startNight(){const pl=[...plan()];for(const n of carryOver.splice(0))if(!pl.some(e=>e[0]===n))pl.unshift([n]);nightPlan=pl;for(const [n,k] of pl){const h=HOF(n);h.userData.knock=k==='knock';markHouse(h);}}
let lastDeliverT=0,lastLine='';
// KNOWN #3: fence reply + keepsake reveal, then sun's nightDone (lights-out walk home)
let postBeat=null,pendingKeep=null,fenceNote=null;
const FENCE_REPLY=[
 {zh:'阿汀：「井边那根绳子……明天你去看，它不在了。」',en:'Ting: "That rope by the well… go look tomorrow. It won\'t be there."'},
 {zh:'老周：「……两下。别记成三下。」',en:'Old Zhou: "…Twice. Don\'t make it three."'},
 {zh:'阿汀：「三样东西都在窗台上。……数到三，就够了。」',en:'Ting: "All three things are on the sill. …Count to three. That\'s enough."'},
];
function placeFenceNote(){
 if(fenceNote){planet.remove(fenceNote);fenceNote=null;}
 fenceNote=new THREE.Group();
 const env=new THREE.Mesh(envGeo.clone(),toon(S.envelope,{gap:0}));env.scale.setScalar(0.85);fenceNote.add(env);
 const st=new THREE.Mesh(stampGeo.clone(),toon(S.scarf,{gap:0}));st.position.set(0.1,0.01,-0.06);fenceNote.add(st);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(0.3,0.028,6,20),toon(S.lamp,{kind:5}));ring.rotation.x=Math.PI/2;ring.position.y=-0.18;fenceNote.add(ring);
 const hu=herHouse.userData;const wp=herHouse.localToWorld(new THREE.Vector3(0.15,0.2,hu.d/2+1.15));const d=wp.clone().normalize();
 fenceNote.position.copy(d).multiplyScalar(surf(d)+0.55);fenceNote.quaternion.setFromUnitVectors(UP,d);
 fenceNote.userData={dir:d,ph:Math.random()*6};planet.add(fenceNote);
}
function beginFenceBeat(){
 if(postBeat)return;postBeat='fence';placeFenceNote();
 const near=P.angleTo(herHouse.userData.dir)*R<3.6;
 if(near)setTimeoutSim(()=>{if(postBeat==='fence')completeFenceBeat();},0.5);
 else setTimeoutSim(()=>{if(postBeat==='fence')toast(TXT[LANG].fenceHint,'hint');},toastDur(lastLine)+0.55);
}
function completeFenceBeat(){
 if(postBeat!=='fence')return;postBeat='done';
 if(fenceNote){burst(fenceNote.position.clone(),fenceNote.userData.dir,10,0.6);planet.remove(fenceNote);fenceNote=null;}
 let keepDur=0;
 if(pendingKeep){if(M<3)camShot=2.6;const k=pendingKeep; /* G: one sill close-up per night (the nightDone push) */pendingKeep=null;const n=KEEP_NOTE[k.id];const text=n?n[LANG]:k[LANG];const from=k.from?(k.from[LANG]||k.from):n?n.from[LANG]:'';
  const s=text+(from?`<br><span style="font-size:18px">— ${from}</span>`:'');toast(s,'prot');keepDur=toastDur(s);}
 const reply=FENCE_REPLY[Math.min(nightN,FENCE_REPLY.length-1)];
 setTimeoutSim(()=>toast(reply[LANG],'prot'),0.05); /* queued right behind the keepsake; the queue paces it */
 const replyDur=toastDur(reply[LANG]);
 setTimeoutSim(()=>{if(postBeat==='done'&&!nightDone)startNightDone();},keepDur+0.3+replyDur+0.45);
 lastDeliverT=T;
}
if(M>=2){for(let i=0;i<6;i++)spawnLetter();if(M>=3)setTimeout(()=>0);}
// v6.1 last-letter pillar: a tall soft beam over the house when one commission is left
const pillar=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,6,16,1,true),new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,side:THREE.DoubleSide,
 uniforms:{uOp:{value:0.35},uCol:{value:new THREE.Color('#ffcf6a')}},blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
 vertexShader:'out float vH;void main(){vH=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'precision highp float;in float vH;uniform float uOp;uniform vec3 uCol;layout(location=0) out vec4 o;layout(location=1) out vec4 gi;void main(){float a=uOp*(1.-smoothstep(0.15,1.,vH));o=vec4(uCol*a*2.9,0.);gi=vec4(0.);}'}));
pillar.geometry.translate(0,3,0);let pillarA=0,pillarH=null;pillar.userData.noOcclude=true;pillar.visible=false;scene.add(pillar);
let lastProgT=0,letterNight=-1,emptyT=0,shotCW=null,ndPush=null;const pushHidden=new Set();let pushWires=null;const fadeEl=document.createElement('div');fadeEl.style.cssText='position:fixed;inset:0;background:#0b1020;opacity:0;pointer-events:none;z-index:5';document.body.appendChild(fadeEl);
const guide=new THREE.Group();{const sh=new THREE.Shape();sh.moveTo(-0.22,-0.1);sh.lineTo(0,0.12);sh.lineTo(0.22,-0.1);sh.lineTo(0.22,-0.02);sh.lineTo(0,0.2);sh.lineTo(-0.22,-0.02);sh.lineTo(-0.22,-0.1);
 const cg=new THREE.ShapeGeometry(sh);cg.rotateX(-Math.PI/2);cg.rotateY(Math.PI);const cm=toon(S.lamp,{kind:5,side:THREE.DoubleSide});for(let i=0;i<3;i++){const c=new THREE.Mesh(cg,cm);c.position.z=i*0.45;c.userData.noOcclude=true;guide.add(c);}}scene.add(guide);guide.visible=false;guide.userData.noOcclude=true;
// ---- planet changes night to night ----
const wireLanterns=[];
function growPlanet(n){
 if(n===1){ // lanterns strung on wires between poles
  planet.traverse(o=>{if(o.isMesh&&o.geometry.type==='TubeGeometry'){const c=o.geometry.parameters.path;for(let i=1;i<6;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6),toon(S.lamp,{kind:5}));m.position.copy(c.getPoint(i/6)).addScaledVector(c.getPoint(i/6).normalize(),-0.07);wireLanterns.push(m);}}});wireLanterns.forEach(m=>planet.add(m));}
 if(n===2){ // paper kites over delivered houses
  for(const h of houses)if(h.userData.done){const k=new THREE.Mesh(new THREE.OctahedronGeometry(0.25,0),toon(pick([S.scarf,S.envelope,S.roof[0]]),{gap:0}));k.scale.set(1,1.4,0.15);k.position.y=h.userData.top+1.8;h.add(k);h.userData.kite=k;}}
 if(n===3){ // flower beds around every house you visited
  for(const h of houses)if(h.userData.done)for(let i=0;i<10;i++){const f=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,5),toon(pick([S.scarf,S.lamp,S.envelope]),{gap:1}));const a=i/10*6.28;const r=h.userData.size*0.7;f.position.set(Math.cos(a)*r,0.08,Math.sin(a)*r);h.add(f);}}
}
const cranes=[];
for(let i=0;i<10;i++){let d;for(let k=0;k<40;k++){d=i<3?randDir(0.25):i<6?nearDir(AREA,AREA_R*0.8,0.15):randDir(0.25);if(obstacles.every(o=>d.angleTo(o.dir)>o.rad+0.3/R))break;} /* v6.2: cranes never inside a collider */const c=new THREE.Group();const b=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.35,3),toon(S.envelope,{gap:0}));b.rotation.z=Math.PI/2;c.add(b);
 for(const s of [1,-1]){const w=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.3,3),toon(S.envelope,{gap:0}));w.rotation.x=s*1.2;w.position.z=s*0.1;w.position.y=0.05;c.add(w);}
 place(c,d,-0.25);c.visible=i<3;cranes.push({g:c,dir:d,found:false,day:i<3?0:i<6?1:2});}
const craneCap=()=>CRANE_CAP[Math.min(nightN,2)];
let found=0;
function finale(){ // end line already shown on the last delivery (merged; no second 包空了)
 window.PaperEcho.finished=true;}
const bursts=[];
const CONF=[S.envelope,S.scarf,S.lamp,S.roof[0]];function burst(at,n,cnt=14,scl=1){for(let i=0;i<cnt;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(0.14,0.1),toon(CONF[i%4],{gap:1,side:THREE.DoubleSide,kind:i%4==2?5:0}));m.position.copy(at);
 const v=n.clone().multiplyScalar(2+rand()*1.5).add(new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).multiplyScalar(2.2));m.scale.setScalar(scl);m.userData={scl,v,life:1.3,spin:new THREE.Vector3(rand(),rand(),rand()).multiplyScalar(8)};scene.add(m);bursts.push(m)}}
// copy v2: courier speaks little (opening / lost / night end); recipients get a quirky line with a twist. Original lines.
const TXT={zh:{carry:'包里的信',deliv:'送了',hint:'WASD 走 · L 中/EN',full:'包满了……',
  open:'又是一封没写门牌号的……算了，先往亮灯那边走。',lost:'咦，这棵树刚才是不是见过？',end:'包空了。今天就到这儿吧。',
  dusk:'天黑得好快，路灯一盏一盏亮起来了。',night2:'昨天那户的窗台上……好像多了点什么。',
  recv:['「这是我寄给自己的生日卡。……提前三个月寄，怕自己忘了。」','「啊，录取通知！……等等，我好像没报名。」','「又是账单吗……哦，是情书。那还是账单吧。」',
   '「我笔友的回信！……我们住对门，就是谁都不敢先开门。」','「我每天给月亮写一封信。……今天终于退回来了，查无此人。」','「这包裹好轻……里面是我上周丢的那只袜子？」',
   '「你看，邮戳是十年前的。……邮局也挺能睡的。」','「谢谢你跑这一趟。……其实我就在窗口看着你绕了三圈。」'],
  tod:['白天','黄昏','夜里','清晨'],waitDark:'信要等黄昏才送。按 N 跳过去。',lastOne:n=>`还差一封。……${n}家的灯，还没等到我。`,failCarry:n=>`……明晚再找${n}吧。`,failLeave:n=>`……把信留在${n}门口吧。`,lightsOut:'灯一盏一盏关了。……还亮着的那几扇，今晚有我的信。',knock:'敲两下',seed:'老周：「明晚路过，敲两下门。……一下我以为是风，三下我以为是收电费的。」',bagEnd:'包空了。……明天的信，明天再说。',lastEnd:'包空了。……一、二、三。够了。',sleepNudge:'按 N 睡觉吧。……纸鹤可以明天再捡。',sleepNudge3:'按 N 睡觉吧。……纸鹤就留给它们自己飞。',fenceHint:'篱笆边……好像压着张纸。',nudge2:'包还沉着。……门口有光的那家，还在等。',here:'送这儿？',none:'……手上没信。',her:n=>`${n}家`},
 en:{carry:'In bag',deliv:'Sent',hint:'WASD to walk · L 中/EN',full:"Bag's full…",
  open:"Another letter with no house number… fine, I'll head for the lit windows.",lost:'Huh… have I seen this tree before?',end:"Bag's empty. That's it for today.",
  dusk:'It got dark so fast. The street lamps are coming on, one by one.',night2:"Yesterday's house… something new on the sill?",
  recv:['"A birthday card I sent myself. …Three months early, in case I forget."','"My acceptance letter! …Wait, I don\'t think I applied."','"Another bill… oh, a love letter. I\'d rather have the bill."',
   '"My pen pal wrote back! …We live across the street. Neither of us dares open the door first."','"I write to the moon every day. …Today one came back. Return to sender."','"So light… is this the sock I lost last week?"',
   '"Look, the postmark is ten years old. …The post office really likes to nap."','"Thanks for coming all this way. …I watched you walk past three times."'],
  tod:['Day','Dusk','Night','Dawn'],waitDark:'Letters go out at dusk. Press N to skip ahead.',lastOne:n=>`One more. …${n}'s light hasn't seen me yet.`,failCarry:n=>`…I'll find ${n} tomorrow night.`,failLeave:n=>`…I'll leave it at ${n}'s door.`,lightsOut:'The lights go out one by one. …The ones still on got my letters tonight.',knock:'Knock twice',seed:'Old Zhou: "Passing by tomorrow night? Knock twice. …Once is the wind. Three times is the electric company."',bagEnd:"Bag's empty. …Tomorrow's letters, tomorrow.",lastEnd:"Bag's empty. …One, two, three. That's enough.",sleepNudge:"Press N to sleep. …Cranes can wait until tomorrow.",sleepNudge3:"Press N to sleep. …The cranes can fly on their own.",fenceHint:"By the fence… a scrap of paper?",nudge2:"The bag's still heavy. …The house with light at its door is still waiting.",here:'Here?',none:'…no letters on me.',her:n=>`${n}'s house`}};

function recipientLine(h){const v=visits.get(h)||0;visits.set(h,v+1);const p=h.userData.person;{const kr=LANG==='zh'?keepsakeReply(h):null;if(kr)return `${p.name.zh}：「${kr.replace(/^「|」$/g,'')}」`;}const idx=h===zhouHouse?(h.userData.knock?1:0):Math.min(v,2);return `${p.name[LANG]}：「${p[LANG][idx].replace(/^「|」$/g,'')}」`;}
// HUD time label follows the sky: todT(PH) >=1.5 night, >=0.8 dusk (dawn on the way back)
function todIdx(){const t=todT(PH);return t>=1.5?2:t>=0.8?(PH>2?3:1):0;}
// discoveries: paper cranes off the paths; finding one makes the courier mutter
const CRANE_LINES={zh:['……谁把纸鹤夹树上了。','尾巴上写着我的名字。……啊？'],
 en:['…who put a crane in a tree?',"My name's on its tail. …Huh?"]};
let said={};function say(key,once=true){if(once&&said[key])return;said[key]=1;toast(TXT[LANG][key]);}
const $=id=>document.getElementById(id);
function toastDur(s){const t=String(s).replace(/<[^>]+>/g,'');const cjk=(t.match(/[\u3400-\u9fff]/g)||[]).length;const lat=t.length-cjk;return Math.max(3.5,cjk*0.18+lat*0.06)+(/…/.test(t)?1.2:0);}
// v6.2: dialogue queue: a line holds at least its read time (0.25 s/char, min 2.5 s, +1.2 s for a …… beat) before the next one shows
let toastQ=[],toastHold=0;function readTime(s){const t=String(s).replace(/<[^>]+>/g,'');const n=[...t].length;return Math.min(Math.max(2.5,n*0.25)+(/…/.test(t)?1.2:0),Math.max(2.5,1+0.15*n),6);} /* v6.3: capped at reading time */
function minRead(s){return Math.min(4,1+0.12*[...String(s).replace(/<[^>]+>/g,'')].length);}
// tiers: story = queued, never dropped (recipient lines, 老周 setup, fence lines, lastOne, failsafe); hint = dropped if anything is showing/queued, never blocks story; pin = clears the queue and plays now (lights-out at nightDone 14 s)
let toastIsHint=false,toastPinned=false,toastShownT=0;
/* v6.2 A: tiers deliv (superseded by the next delivery / night completion), prot (keepsake + fence: must play before lights-out), story, hint (dropped freely), pin (lights-out: clears whatever is left) */
const toastTier=new Map();let shownTier='story';
function dropDeliv(alsoShowing){if(alsoShowing&&shownTier==='deliv'&&toastHold>0){const nc=[...String(lastShown).replace(/<[^>]+>/g,'')].length;toastHold=Math.min(toastHold,Math.max(0,1+0.15*nc-(T-toastShownT)));}} /* superseded lines still get their reading time (1 s + 0.15 s/char) */
function protPending(){return toastQ.some(q=>toastTier.get(q)==='prot')||(shownTier==='prot'&&toastHold>0);}
/* v6.8 #40 two-level pacing, night 2 only: one subtitle at a time; 1.5 s gap inside an exchange, >=8 s between exchanges; dur=max(1.5,chars/7+0.5); <=3 lines per exchange; priority reply>hint>老周>chatter; hints wait <=20 s; 老周 1 line/night + 30 s cooldown */
const PACE={inGap:1.5,exGap:8,maxLines:3,hintWait:20,zhouCool:30};
let flushQ=null,flushAt=0; /* last letter landed with replies still queued: they and the completing reply show together in one box, right away, ahead of the ending */
const subQ=[];let ex={lines:0,lastEnd:-1e9,joinUntil:-1e9},zhouN=-1,zhouT=-1e9,paceOn=false;window.subtitleLog=[];
const paceActive=()=>N2()&&!nightDone&&(state.deliveredNight||0)<quota(); /* walking part of night 2; the end-of-night sequence (last reply, keepsake/fence, lights-out) keeps the #34/#35 rules so lights-out <=10 s / dawn <=18 s hold */ /* whole of night 2 until the lights-out line */
const paceEnd=()=>(state.deliveredNight||0)>=quota(); /* end-of-night sequence: the 8 s exchange gap is waived (1.5 s gap + full duration still hold) so lights-out isn't pushed past ~20 s */
window.subQueue=()=>subQ.map(q=>q.s); /* walking part of night 2; once the last letter lands the end-of-night sequence keeps the #34/#35 rules */
function subDur(s){const n=[...String(s).replace(/<[^>]+>/g,'')].length;return Math.max(1.5,n/7+0.5);}
function subPri(s,tier){if(tier==='deliv'||tier==='prot')return 0;if(tier==='hint')return 1;if(/^(老周|Old Zhou)/.test(String(s).replace(/<[^>]+>/g,'')))return 2;return 3;}
function paceTick(){if(!paceActive()){if(paceOn){paceOn=false;const rep=subQ.filter(q=>q.pri===0);subQ.length=0; /* last letter landed: queued replies go now, top priority, ahead of the ending; hints/chatter dropped */
  if(rep.length){flushQ=rep.map(q=>q.s);flushAt=T+0.6;}}
 if(flushQ&&T>=flushAt){const all=flushQ;flushQ=null;const m=all.join('<br>');toastTier.set(m,'deliv');if(toastHold>0&&shownTier==='deliv')toastHold=Math.min(toastHold,Math.max(0,minRead(lastShown)-(T-toastShownT)));toast(m,'deliv');}
 return;}
 if(!paceOn){paceOn=true;while(toastQ.length){const q=toastQ.shift();const t=toastTier.get(q)||'story';subQ.push({s:q,tier:t,pri:subPri(q,t),t:T});}}
 for(let i=subQ.length-1;i>=0;i--)if(subQ[i].pri>=1&&T-subQ[i].t>PACE.hintWait)subQ.splice(i,1);
 if(toastHold>0||!subQ.length)return;
 let bi=0;for(let i=1;i<subQ.length;i++)if(subQ[i].pri<subQ[bi].pri)bi=i;const q=subQ[bi];
 const join=ex.lines>0&&ex.lines<PACE.maxLines&&q.t<=ex.joinUntil; /* queued while the exchange was running */
 if((join||paceEnd()||q.pri===0)?T-ex.lastEnd<PACE.inGap:T-ex.lastEnd<PACE.exGap)return; /* v6.8b: a recipient reply never waits the 8 s exchange gap (only 1.5 s), so it can't back up past the last delivery */
 if(q.pri===2){if(zhouN===nightN||T-zhouT<PACE.zhouCool){subQ.splice(bi,1);return;}zhouN=nightN;zhouT=T;}
 subQ.splice(bi,1);if(!join)ex.lines=0;ex.lines++;toastTier.set(q.s,q.tier);showToast(q.s);toastHold=subDur(q.s);state.toastT=toastHold;ex.joinUntil=T+toastHold+PACE.inGap;}
function subEnd(){const L=window.subtitleLog;if(L.length&&L[L.length-1].end==null){L[L.length-1].end=+T.toFixed(2);if(paceActive())ex.lastEnd=T;}}
function toast(s,tier='story'){s=String(s);
 if(flushQ&&tier==='deliv'&&!s.includes('<br>')){flushQ.push(s);return;}
 if(tier!=='pin'&&paceActive()){const pri=subPri(s,tier);if(subQ.some(q=>q.s===s)||(lastShown===s&&toastHold>0))return;subQ.push({s,tier,pri,t:T});return;}
 if(tier==='pin'){if(toastHold>0.05&&shownTier!=='hint'&&T-toastShownT<Math.min(2.5,minRead(lastShown)))(window.__trunc=window.__trunc||[]).push(String(lastShown).slice(0,14));toastQ.length=0;toastHold=0;showToast(s);toastPinned=true;shownTier='pin';return;} // pin: nothing plays after the lights-out line
 if(ndLine&&nightDone)return;
 if(M>=3&&nightN>=NIGHTS_TOTAL)return; /* I: nothing after the finale */
 if(nightDone&&nightDoneT>=7&&tier!=='prot')return; // only protected lines start after nightDone 7 s
 if(tier==='hint'){if((toastHold>0&&!toastIsHint)||toastQ.length)return;showToast(s);toastIsHint=true;shownTier='hint';return;}
 if(tier==='deliv')dropDeliv(true);
 toastTier.set(s,tier);
 if(toastHold>0&&(shownTier==='story'||shownTier==='deliv'))toastHold=Math.min(toastHold,Math.max(0,Math.min(2.5,minRead(lastShown))-(T-toastShownT))); /* a waiting line preempts story/delivery lines after their min read time */
 if(toastHold>0&&!toastIsHint){if(tier==='deliv'){const pi=toastQ.findIndex(q=>toastTier.get(q)==='prot');if(pi>=0)toastQ.splice(pi,0,s);else toastQ.push(s);}else if(toastQ[toastQ.length-1]!==s)toastQ.push(s);return;} /* every recipient line shows once, in order, ahead of keepsake/fence */ /* the completing recipient's line goes ahead of keepsake/fence */
 showToast(s);shownTier=tier;}
function dropLastOne(){const pre=TXT[LANG].lastOne('').split('…')[0];for(let i=toastQ.length-1;i>=0;i--)if(String(toastQ[i]).startsWith(pre))toastQ.splice(i,1);if(String(lastShown).startsWith(pre)&&toastHold>0){toastHold=0;state.toastT=0;toastBeat=null;$('toast').style.opacity=0;}} /* bug 1: no 还差一封 after 送完了 */
let lastShown='';let toastBeat=null;function showToast(s){subEnd();window.subtitleLog.push({text:String(s).replace(/<[^>]+>/g,''),tier:toastTier.get(s)||'story',night:nightN,start:+T.toFixed(2),end:null});lastShown=s;shownTier=toastTier.get(s)||'story';toastIsHint=false;toastPinned=false;toastShownT=T;{const nc=[...String(s).replace(/<[^>]+>/g,'')].length;toastHold=toastQ.length>=1?(shownTier==='prot'?Math.min(readTime(s),Math.max(2.0,minRead(s))):minRead(s)):readTime(s); /* something waiting: min read time (1 s + 0.12 s/char, cap 4 s) */if(shownTier==='prot'||(M>=3&&(state.deliveredNight||0)>=quota()))toastHold=Math.min(toastHold,Math.min(6,1+0.15*nc));} /* after the night completes / protected lines: reading time only (1 s + 0.15 s/char, max 6 s) */ /* 2+ lines waiting: shorter hold */const m=s.match(/……|…/);const i=m?m.index:-1;const el=$('toast');el.style.opacity=1;state.toastT=Math.max(toastDur(s),toastHold);
 if(i>4){el.innerHTML=s.slice(0,i+m[0].length);toastBeat={t:1.2,full:s};}else{el.innerHTML=s;toastBeat=null;}}
function hud(){const t=TXT[LANG];
 {const ENV='<svg width="20" height="15" viewBox="0 0 20 15" style="vertical-align:-1px"><rect x="1" y="1" width="18" height="13" rx="2" fill="#f6efe2" stroke="#373f42" stroke-width="1.4"/><path d="M1.5 2l8.5 6.5L18.5 2" fill="none" stroke="#373f42" stroke-width="1.4"/></svg>';
 const CRANE='<svg width="18" height="14" viewBox="0 0 18 14" style="vertical-align:-1px"><path d="M1 9l7-2 2-6 1 6 6 1-6 2-1 4-2-4z" fill="#f6efe2" stroke="#373f42" stroke-width="1"/></svg>';
 const CHECK='<svg width="16" height="14" viewBox="0 0 16 14" style="vertical-align:-1px"><path d="M2 7l4 4 8-9" fill="none" stroke="#ffcf6a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 // session label: from dusk (PH>=1) until nightEnd keep 「第 N 晚」 so dawn+unfinished quota doesn't read as a failed day
 const zh=LANG==='zh',q=quota(),dn=Math.min(state.deliveredNight||0,q),done=!!(window.PaperEcho&&window.PaperEcho.finished),full=M>=3&&!done&&dn>=q,ks=np?np.state.keepsakes:0,night=todIdx()===2||PH>=1;
 const fenceGo=full&&postBeat==='fence';const dawnNext=full&&!nightDone&&PH>=2.6&&nightN<NIGHTS_TOTAL-1;const star=dawnNext?'':done?`<div>★ ${zh?'今晚的信都送完了。':'Tonight\'s letters are done.'}</div>`:(full?`<div>★ ${zh?'送完了。':'All delivered.'}</div><div style="font-size:16px">${fenceGo?(zh?'去篱笆看看':'Check the fence'):(zh?'（N）睡觉':'(N) bedtime')}</div>`:`<div>★ ${t.deliv} ${dn}/${q}</div>`);
 const dayLine=dawnNext?(zh?'第 '+(nightN+2)+' 天':'Day '+(nightN+2)):done?(zh?'三晚送到了':'Three nights done'):(night?(zh?'第 '+(nightN+1)+' 晚':'Night '+(nightN+1)):(zh?'第 '+(nightN+1)+' 天':'Day '+(nightN+1)));
 $('hud').innerHTML=M>=2?`<div class="big">${ENV} ${zh?'信':'Letters'} ${state.carry}</div>`+star+
  (M>=3?`<div style="font-size:18px">${dayLine}</div><div style="font-size:18px;${camShot>0?'display:none':''}">${CRANE} ${zh?'纸鹤':'Cranes'} ${found}/${craneCap()}</div>`+(ks>0?`<div style="font-size:18px">${zh?'留下的':'Kept'} ${ks}</div>`:''):''):'';}
 {const k=todIdx();const ic=['<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="4.5" fill="#ffcf6a"/><g stroke="#ffcf6a" stroke-width="1.6" stroke-linecap="round"><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M3.3 14.7l1.4-1.4M13.3 4.7l1.4-1.4"/></g></svg>','<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="11" r="6" fill="#f2a06a"/><rect x="0" y="11" width="18" height="8" fill="#373f42"/></svg>','<svg width="18" height="18" viewBox="0 0 18 18"><path d="M12.5 2.5a7 7 0 1 0 3 11.5a5.5 5.5 0 0 1-3-11.5z" fill="#f6efe2"/></svg>'][k===3?1:k];$('tod').innerHTML=M>=3?ic+' '+t.tod[k]:'';}$('hint').textContent=waitDark()?t.waitDark:t.hint;}

// ---------- input ----------
const keys={};addEventListener('keydown',e=>{if(nightDone&&nightDoneT>1){skipPending=1;return;}keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='l'){LANG=LANG==='zh'?'en':'zh';hud();}if(e.key.toLowerCase()==='n'&&M>=3)skipNight=true;});addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
const kd=(...k)=>k.some(x=>keys[x]);

// ---------- post: outline B + LUT A + glow ----------
function grade(r,g,b){const l=0.299*r+0.587*g+0.114*b;const sat=1.05;let o=[l+(r-l)*sat,l+(g-l)*sat,l+(b-l)*sat]; // was 1.18: the palette carries the colour, the grade only nudges
 const sh=(1-l)*(1-l)*0.14,hi=l*l*0.12;o=[o[0]-sh*0.6+hi*0.35,o[1]+sh*0.15+hi*0.25,o[2]+sh*0.35+hi*0.02];return o.map(c=>Math.round(255*Math.min(1,Math.max(0,c))));}
const LS=33;const lutData=new Uint8Array(LS*LS*LS*4);
for(let z=0;z<LS;z++)for(let y=0;y<LS;y++)for(let x=0;x<LS;x++){const o=grade(x/(LS-1),y/(LS-1),z/(LS-1));lutData.set([o[0],o[1],o[2],255],4*(x+y*LS+z*LS*LS))}
const lut=new THREE.Data3DTexture(lutData,LS,LS,LS);lut.minFilter=lut.magFilter=THREE.LinearFilter;lut.unpackAlignment=1;lut.needsUpdate=true;
const rt=new THREE.WebGLRenderTarget(W,H,{count:2,type:THREE.HalfFloatType,depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
const BW=W/4,BH=H/4;const mk=()=>new THREE.WebGLRenderTarget(BW,BH,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false});const bA=mk(),bB=mk();
const vs=`out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const ext=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{tC:{value:rt.textures[0]}},vertexShader:vs,fragmentShader:`precision highp float;in vec2 vUv;out vec4 o;uniform sampler2D tC;
void main(){vec2 p=1./vec2(textureSize(tC,0));vec3 s=vec3(0);for(int x=-2;x<2;x++)for(int y=-2;y<2;y++){vec4 c=texture(tC,vUv+p*(vec2(x,y)+.5));float l=dot(c.rgb,vec3(.299,.587,.114));s+=c.a<0.?c.rgb*smoothstep(.75,.95,l):vec3(0);}o=vec4(s/16.,1.);}`});
const blur=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{t:{value:null},d:{value:new THREE.Vector2()}},vertexShader:vs,fragmentShader:`precision highp float;in vec2 vUv;out vec4 o;uniform sampler2D t;uniform vec2 d;
void main(){float w[7]=float[7](0.199,0.176,0.121,0.065,0.027,0.009,0.002);vec3 s=texture(t,vUv).rgb*w[0];for(int i=1;i<7;i++){s+=(texture(t,vUv+d*float(i)).rgb+texture(t,vUv-d*float(i)).rgb)*w[i];}o=vec4(s,1.);}`});
const post=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{tC:{value:rt.textures[0]},tI:{value:rt.textures[1]},tB:{value:bA.texture},tL:{value:lut},uGlow:{value:GLOW},
 near:{value:camera.near},far:{value:camera.far},time:{value:0},res:{value:new THREE.Vector2(W,H)},uSkyTop:{value:new THREE.Vector3()},uSkyHor:{value:new THREE.Vector3()},uCloud:{value:new THREE.Vector3()},uLine:{value:new THREE.Vector3()},uNightK:{value:0}},
vertexShader:vs,fragmentShader:`precision highp float;precision highp sampler3D;in vec2 vUv;out vec4 o;uniform sampler2D tC,tI,tB;uniform sampler3D tL;uniform float near,far,time,uGlow,uNightK;uniform vec2 res;uniform vec3 uSkyTop,uSkyHor,uCloud,uLine;
float lin(float d){float z=d*2.-1.;return (2.*near*far/(far+near-z*(far-near))-near)/(far-near);}
vec3 decN(vec2 e){vec2 f=e*4.-2.;float k=dot(f,f);float g=sqrt(1.-k/4.);return vec3(f*g,1.-k/2.);}
float fit(float v,float a,float b){return clamp((v-a)/(b-a),0.,1.);}
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n2(p);p=p*2.03+7.1;a*=.5;}return s;}
void main(){vec2 px=2.0*(res.y/800.)/res;
 vec2 dirs[5]=vec2[5](vec2(0),vec2(-1,0),vec2(1,0),vec2(0,-1),vec2(0,1));
 float d0=1.;for(int i=0;i<5;i++)d0=min(d0,lin(1.-texture(tI,vUv+px*dirs[i]).r)); // nearest surface around this pixel (so a silhouette against the sky gets the object's weight on both sides)
 float fk=fit(d0,0.05,0.12);px*=mix(1.2,0.6,fk); // line weight by distance: heavier up close, hairline on the far side of the planet
 float id[5],dp[5],ct[5];vec3 nr[5];
 for(int i=0;i<5;i++){vec4 n=texture(tI,vUv+px*dirs[i]);dp[i]=lin(1.-n.r);nr[i]=decN(n.gb);ct[i]=n.a;id[i]=abs(texture(tC,vUv+px*dirs[i]).a);}
 float dI=length(vec2(id[1]-id[2],id[3]-id[4]));
 float dD=length(vec2(dp[1]-dp[2],dp[3]-dp[4]))/max(dp[0],0.02);
 float dN=length(vec2(distance(nr[1],nr[0])-distance(nr[2],nr[0]),distance(nr[3],nr[0])-distance(nr[4],nr[0])));
 float e=max(max(fit(dI,0.003,0.01)*(1.-0.75*fk),fit(dD,0.06,0.12)),fit(dN,0.45,0.7)*(1.-0.6*fk)); // far away only silhouettes survive; interior id/normal lines (leaf lobes, rock stripes) drop out instead of turning to noise
 float c=ct[0];float m=dp[0];for(int i=1;i<5;i++)if(dp[i]<m){m=dp[i];c=ct[i];} // the FRONT surface decides whether its silhouette is inked (was max(): ground pixels inked the grass blades in front of them)
 e*=c*(1.-0.45*fk);
 if(texture(tC,vUv).a<0.)e*=0.2; // v6: outlines don't eat small lit windows/lamps at distance
 vec4 c0=texture(tC,vUv);vec4 i0=texture(tI,vUv);
 bool sky=i0.r<=0.0001&&i0.g==0.&&i0.b==0.;
 vec3 col=pow(max(c0.rgb,0.),vec3(1./2.2));
 if(sky){vec2 su=vUv*vec2(res.x/res.y,1.);float t=vUv.y;
  col=mix(uSkyHor,uSkyTop,smoothstep(0.15,0.95,t));
  float st=step(0.996,h2(floor(su*180.)))*uNightK*smoothstep(0.3,0.8,t);col+=st;
  vec2 cp=su*vec2(1.7,3.4)+vec2(time*0.012,0.);float cb=0.12*smoothstep(0.45,0.95,t)-0.03; // fewer, broader, flatter puffs; most of the sky stays open
  float cl=fbm(cp)+cb,below=fbm(cp-vec2(0.,0.16))+cb; // cloud continues underneath -> sunlit upper body; cloud edge below -> flat shaded underside
  float body=smoothstep(0.64,0.655,cl),lit=body*smoothstep(0.6,0.66,below);
  col=mix(col,mix(uCloud,uSkyTop,0.3),body);col=mix(col,uCloud,lit);}
 col=mix(col,mix(uLine,col*0.42,0.3),clamp(e,0.,1.)); // line picks up a little of the local colour instead of one flat grey
 if(!sky)col=mix(col,uSkyHor,fit(d0,0.06,0.14)*0.42); // aerial perspective: the far side of the planet sinks into the horizon colour
 col=texture(tL,clamp(col,0.,1.)*(32./33.)+0.5/33.).rgb;
 col+=texture(tB,vUv).rgb*uGlow*(1.-0.6*e);
 o=vec4(col,1.);}`});
scene.userData.post=post;scene.userData.palReg=reg;scene.userData.uNight=G.uNight;scene.userData.glowMax=GLOW;
const fsq=new THREE.Mesh(new THREE.PlaneGeometry(2,2),post);const pscene=new THREE.Scene();pscene.add(fsq);const ocam=new THREE.Camera();
const bq=new THREE.Mesh(new THREE.PlaneGeometry(2,2),ext);const bscene=new THREE.Scene();bscene.add(bq);
function bloom(){bq.material=ext;renderer.setRenderTarget(bA);renderer.render(bscene,ocam);bq.material=blur;
 for(const sc of [1.5,3.0]){blur.uniforms.t.value=bA.texture;blur.uniforms.d.value.set(sc/BW,0);renderer.setRenderTarget(bB);renderer.render(bscene,ocam);
  blur.uniforms.t.value=bB.texture;blur.uniforms.d.value.set(0,sc/BH);renderer.setRenderTarget(bA);renderer.render(bscene,ocam);}}

// ---------- simulation ----------
const SPEED=2.8,TURN=2.6;let idleT=1,deliverT=0,nudge=new THREE.Vector3(),hop=0,T=0,walkPh=0,vel=0,tvel=0;const camPos=new THREE.Vector3(),camUp=new THREE.Vector3(0,1,0);let camInit=false,camShot=0;
const camRay=new THREE.Raycaster();let camOccl=null;const tmp=new THREE.Vector3(),axis=new THREE.Vector3(),camF=new THREE.Vector3(0,0,1);
function setP3(v){const a=palRGB(v[0]);v[1].set(a[0],a[1],a[2]);}
const labels=document.createElement('div');document.body.appendChild(labels);
const arrow=document.createElement('div');arrow.style.cssText='position:fixed;width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;border-bottom:30px solid #ffcf6a;filter:drop-shadow(0 0 2px #373f42) drop-shadow(0 2px 0 #373f42);pointer-events:none;display:none';document.body.appendChild(arrow);const arrowTxt=document.createElement('div');arrowTxt.style.cssText='position:fixed;transform:translate(-50%,-50%);background:rgba(55,63,66,.7);color:#f6efe2;border-radius:8px;text-shadow:1px 0 #373f42,-1px 0 #373f42,0 1px #373f42,0 -1px #373f42;padding:0 6px;font-size:18px;display:none;pointer-events:none';document.body.appendChild(arrowTxt);
const pops=[];function pop(text,world){const d=document.createElement('div');d.textContent=text;d.style.cssText='position:fixed;color:#f6efe2;font-size:30px;text-shadow:1px 0 #373f42,-1px 0 #373f42,0 1px #373f42,0 -1px #373f42,0 2px 4px #373f42;pointer-events:none;transform:translate(-50%,-50%)';document.body.appendChild(d);pops.push({d,w:world.clone(),t:0});}
const topEl=document.createElement('div');topEl.style.cssText='position:fixed;left:50%;top:18px;transform:translateX(-50%);background:rgba(55,63,66,.7);color:#f6efe2;border-radius:10px;padding:4px 14px;font-size:24px;opacity:0;transition:opacity .25s;pointer-events:none;text-shadow:1px 0 #373f42,-1px 0 #373f42,0 1px #373f42,0 -1px #373f42';document.body.appendChild(topEl);let topT=0;
function topPop(s){topEl.textContent=s;topEl.style.opacity=1;topT=2.2;}
function proj(v){const p=v.clone().project(camera);return {x:(p.x*0.5+0.5)*W,y:(-p.y*0.5+0.5)*H,z:p.z,on:Math.abs(p.x)<0.95&&Math.abs(p.y)<0.95&&p.z<1};}
let clueEl=null;function clueHud(){if(!clueEl){clueEl=document.createElement('div');clueEl.id='clue';clueEl.style.cssText='position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#fffaf0;color:#373f42;border:2px solid #373f42;border-radius:8px;padding:3px 12px;font-size:17px;white-space:nowrap;pointer-events:none;z-index:4;display:none;font-family:\'LXGW Marker Gothic\',sans-serif';document.body.appendChild(clueEl);}
 const c=clueOn()&&state.carry>0&&arrowH?clueFor(arrowH):null;const txt=c?(LANG==='zh'?'信封上写着：':'On the envelope: ')+c:'';if(clueEl.textContent!==txt)clueEl.textContent=txt;clueEl.style.display=txt?'block':'none';} /* v6.8: clue of the held (top) letter = the locked recipient */
let arrowH=null;function prompts(){if(M<2)return;let html='';let nearest=null,nd=1e9,nearestH=null;
 for(const h of state.targets){const top=h.position.clone().addScaledVector(h.userData.dir,h.userData.top+1.4);const pr=proj(top);const dist=P.angleTo(h.userData.dir)*R;
  if((state.carry>0||h.userData.knock)&&dist<nd){nd=dist;nearest=pr;nearestH=h;}
  const facing=top.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))>0;
}
 labels.innerHTML=html;
 /* v6.4: arrow target with hysteresis (switch only if another deliverable door is >3 m closer or the current one is gone); direction from a point 2 m along the ground toward it, so it doesn't flip behind the camera */
 if(nearestH){if(!arrowH||!state.targets.includes(arrowH)||!(state.carry>0||arrowH.userData.knock))arrowH=nearestH; /* v6.5: locked on one recipient (nearest by ground distance at lock time) until delivered; pickups/refills never retarget */
  nd=P.angleTo(arrowH.userData.dir)*R;nearestH=arrowH;const tan=arrowH.userData.dir.clone().sub(P.clone().multiplyScalar(P.dot(arrowH.userData.dir))).normalize();const base=P.clone().multiplyScalar(surf(P)+0.8);const pa=proj(base),pb=proj(base.clone().addScaledVector(tan,2));const cx=W/2,cy=H/2;nearest={x:cx+(pb.x-pa.x)*50,y:cy+(pb.y-pa.y)*50,z:0};}else arrowH=null;
 // off-screen arrow toward nearest target when carrying
 if(postBeat==='fence'&&fenceNote){const pr=proj(fenceNote.position);const cx=W/2,cy=H/2;let dx=pr.x-cx,dy=pr.y-cy;if(pr.z>1){dx=-dx;dy=-dy;}const a=Math.atan2(dy,dx);const ndf=P.angleTo(fenceNote.userData.dir)*R;
  if(ndf>2){arrow.style.display='block';const ex=Math.cos(a),ey=Math.sin(a);const sc=Math.min((W/2-50)/Math.max(1e-3,Math.abs(ex)),(ey>0?H/2-150:H/2-90)/Math.max(1e-3,Math.abs(ey)));arrow.style.left=(cx+ex*sc-16)+'px';arrow.style.top=(cy+ey*sc-15)+'px';arrow.style.transform=`rotate(${a+Math.PI/2}rad)`;arrowTxt.style.display='block';arrowTxt.textContent=(LANG==='zh'?'回信 · ':'Reply · ')+ndf.toFixed(0)+'m';arrowTxt.style.left=(cx+ex*(sc-48))+'px';arrowTxt.style.top=(cy+ey*(sc-48))+'px';}
  else {arrow.style.display='none';arrowTxt.style.display='none';}}
 else if(nightOpen()&&(state.carry>0||state.targets.some(h=>h.userData.knock))&&nearest&&nd>2&&arrowAllowed()){const cx=W/2,cy=H/2;let dx=nearest.x-cx,dy=nearest.y-cy;if(nearest.z>1){dx=-dx;dy=-dy;}const a=Math.atan2(dy,dx);
  arrow.style.display='block';const ex=Math.cos(a),ey=Math.sin(a);const sc=Math.min((W/2-50)/Math.max(1e-3,Math.abs(ex)),(ey>0?H/2-150:H/2-90)/Math.max(1e-3,Math.abs(ey)));arrow.style.left=(cx+ex*sc-16)+'px';arrow.style.top=(cy+ey*sc-15)+'px';arrow.style.transform=`rotate(${a+Math.PI/2}rad)`;arrow.title='';arrowTxt.style.display='block';arrowTxt.textContent=(nearestH&&nearestH.userData.knock?TXT[LANG].knock+' · ':'')+nd.toFixed(0)+'m';arrowTxt.style.left=(cx+ex*(sc-48))+'px';arrowTxt.style.top=(cy+ey*(sc-48))+'px';}
 else {arrow.style.display='none';arrowTxt.style.display='none';}
 if(arrow.style.display==='block'){const hr=$('hud').getBoundingClientRect();const ax=parseFloat(arrow.style.left),ay=parseFloat(arrow.style.top),tx=parseFloat(arrowTxt.style.left),ty=parseFloat(arrowTxt.style.top);if(hr.width>0&&Math.min(ax,tx-60)<hr.right+8&&Math.min(ay,ty-12)<hr.bottom+8){const dy=hr.bottom+24-Math.min(ay,ty-12);arrow.style.top=(ay+dy)+'px';arrowTxt.style.top=(ty+dy)+'px';}} /* v6.7: edge arrow + label never sit on the top-left HUD box */
 for(const p of [...pops]){p.t+=1/30;const pr=proj(p.w.clone().addScaledVector(p.w.clone().normalize(),p.t*1.2));p.d.style.left=pr.x+'px';p.d.style.top=pr.y+'px';p.d.style.opacity=Math.max(0,1-p.t/1.6);p.d.style.fontSize=(30*(p.t<0.15?0.6+p.t/0.15*0.8:1.4-Math.min(0.4,(p.t-0.15)*1.5)))+'px';if(p.t>1.6){p.d.remove();pops.splice(pops.indexOf(p),1);}}}
// ---- hook for àṣẹ's island module (room keepsakes + fence lights) ----
// usage: window.PaperEcho.onNightEnd.push(({night, delivered, houses}) => { ... });
window.PaperEcho={onNightEnd:[],nightIndex:0,deliveredThisNight:[]};
let prevPH=PH,nightN=0,skipNight=false,tOff=0;const NIGHTS_TOTAL=+(Q.get('nights')||3);
let nightEnded=false;function nightEndPre(){pendingND=false;}
function nightEnd(){nightEndPre();nightEnded=true;for(const hh of houses)hh.userData.win.userData.u.uLit.value=0;endNightDone();state.holdNight=false;$('toast').style.opacity=0;state.toastT=0;toastBeat=null;timers.length=0;toastQ.length=0;toastHold=0;scene.userData.deliveredTonight=[];scene.userData.lightsOut=null;postBeat=null;pendingKeep=null;if(fenceNote){planet.remove(fenceNote);fenceNote=null;}if(M>=3){np.advanceNight();state.carry=0;np.update(0);state.deliveredNight=0;for(const hh of houses)hh.userData.doneN=false;for(const t of [...state.targets]){const mk=markers.get(t);t.remove(mk);t.remove(mk.userData.ring);markers.delete(t);t.userData.win.userData.u.uLit.value=t.userData.done?1:0;}state.targets.length=0;nightN++;
  if(nightN<NIGHTS_TOTAL){{const ph0=nightN>=2?0.8:0;if(ph0>0){tOff+=ph0/3*CYCLE;}} // day 2: ~15 s of daylight for the rope unlock; day 3 starts at dusk
  growPlanet(nightN);if(nightN===1)openArea();cranes.forEach(c=>{if(c.day<=nightN&&!c.found)c.g.visible=true;});startNight();}else finale();}const pe=window.PaperEcho;const info={night:pe.nightIndex,delivered:state.delivered,houses:[...pe.deliveredThisNight]};
 for(const fn of pe.onNightEnd){try{fn(info)}catch(e){console.error('onNightEnd hook',e)}}pe.nightIndex++;pe.deliveredThisNight=[];}
// ---- v6 'night done' phase (interface for Ìtùtù's lights-out in daynight.js) ----
// scene.userData.nightDone: true while the phase runs; scene.userData.deliveredTonight: [house Group] that got letters tonight (keep lit)
// scene.userData.nightDoneT: seconds since the phase began. Ends at 14 s (ND_LEN), on any key, or at dawn -> skips to the next morning.
const ND_LEN=14,ND_WAIT=13; /* nightDone waits for story lines up to 13 s after the last delivery; line on by nightDone 10 s -> gap <=23 s */ let ndLineT=0,toastEndT=0;let nightDone=false,nightDoneT=0,ndLine=false,skipPending=0;
let pendingND=false,lastRealDeliverT=0;function startNightDone(){if(nightDone)return;if(T-lastRealDeliverT<2){pendingND=true;return;}pendingND=false; // story lines finish before lights-out begins
 nightDone=true;nightDoneT=0;scene.userData.nightDone=true;scene.userData.nightDoneT=0;
 scene.userData.deliveredTonight=window.PaperEcho.deliveredThisNight.map(i=>houses[i]).filter(Boolean);ndLine=false;skipPending=0;
 scene.userData.lightsOut={k:0,keep:scene.userData.deliveredTonight};}
function endNightDone(){ndPush=null;fadeEl.style.opacity=0;pushHidden.forEach(o=>o.visible=true);pushHidden.clear();nightDone=false;scene.userData.nightDone=false;scene.userData.nightDoneT=0;delete scene.userData.lightsOut;}
const timers=[];function setTimeoutSim(f,t){timers.push({f,t:T+t});}
function step(dt){for(const tm of [...timers])if(T>=tm.t){timers.splice(timers.indexOf(tm),1);tm.f();}
 T+=dt;
 if(M>=3&&!FIXPAL&&(TODQ===null||TODQ==='auto')){if(PH<0.8)tOff+=(nightN===1?(0.8*CYCLE/3/15-1):2)*dt;/* v6.2: daytime runs 3x; F: day 2 lasts ~15 s */PH=((T+tOff)/CYCLE*3)%3;if(!skipNight&&(state.targets.length||state.holdNight)&&PH>2.2){tOff-=(PH-2.2)/3*CYCLE;PH=2.2;}if(skipNight){const held=(state.targets.length||state.holdNight)&&!nightDone;const tgt=(state.targets.length&&!nightDone&&PH<0.8)?0.8:held?PH:3.001;tOff+=(tgt-PH)/3*CYCLE;skipNight=false;PH=((T+tOff)/CYCLE*3)%3;if(tgt>3)prevPH=3;}} /* skip wraps straight into the next morning (3.001 -> PH≈0.001; prevPH=3 so the wrap test below fires nightEnd this frame even when the night was finished early, at PH<1.5). It used to stop at 2.999, and the holdNight clamp pulled it back to 2.2 next frame unless one frame's dt was >= 0.08 s; the real loop caps dt at 0.05, so the game never left night 1. While letters remain, N at night is a no-op (was a one-frame jump) */
 if(prevPH>1.5&&PH<prevPH-1)nightEnd();prevPH=PH;
 const nf=PH<2.55?THREE.MathUtils.smoothstep(PH,1.05,1.7):1-THREE.MathUtils.smoothstep(PH,2.55,2.9); // night dim starts after dusk (dusk used to render fully dimmed: grey houses, muddy clouds)
 G.uNight.value=nf;{const s=palRGB(S.skytop),mx=Math.max(...s,1e-3);G.uShade.value.setRGB(s[0]/mx,s[1]/mx,s[2]/mx);}post.uniforms.uNightK.value=PH>1.5&&PH<2.8?Math.min(1,(PH-1.5)*3)*(1-THREE.MathUtils.smoothstep(PH,2.5,2.8)):0;
 if(!DN){ updatePalette();{const t=todT(PH);const N=SWITCH.length;SWITCH.forEach((m,i)=>{const k=(i*7919%N)/Math.max(N-1,1);const t0=0.8+k*(0.5-0.06);m.userData.u.uOn.value=ss(t0,t0+0.06,t);});
  post.uniforms.uGlow.value=GLOW*Math.max(0.35,ss(0.7,1.7,t));}{const w=palRGB(S.winlight,1.5);G.uWarm.value.set('#ffcf6a');}
 for(const [k,u] of [[S.skytop,'uSkyTop'],[S.skyhor,'uSkyHor'],[S.cloud,'uCloud'],[S.outline,'uLine']])setP3([k,post.uniforms[u].value]);
 {const t=todT(PH);const bh=Math.sin(Math.PI*ss(1,2,t))*0.6;post.uniforms.uSkyTop.value.lerp(new THREE.Vector3(...BH_TOP),bh);post.uniforms.uSkyHor.value.lerp(new THREE.Vector3(...BH_HOR),bh);}}
 else{DN.applyTimeOfDay(scene,todT(PH));for(const u of ["uSkyTop","uSkyHor","uCloud","uLine"]){const v=post.uniforms[u].value;v.set(Math.pow(v.x,1/2.2),Math.pow(v.y,1/2.2),Math.pow(v.z,1/2.2));}post.uniforms.uCloud.value.multiplyScalar(1-0.5*G.uNight.value);} // daynight.js gives linear colours; our sky/line maths runs in sRGB
 // v5: windows guaranteed on by deep night (todT>=1.3) whatever the switch schedule did; delivered houses stay lit (uLit)
 if(nightEnded&&todT(PH)>=0.8&&PH<2)nightEnded=false;{const t=todT(PH);for(const h of houses){const u=h.userData.win.userData.u;if(h.userData.done&&t>=0.8&&!nightEnded)u.uLit.value=1;}}
 sun.intensity=[2.4,2.0,0.7][Math.floor(PH)]*(1-(PH%1))+[2.0,0.7,2.4][Math.floor(PH)]*(PH%1);hemi.intensity=0.5;
 // input -> movement on sphere
 let fwd=(kd('w','arrowup')?1:0)-(kd('s','arrowdown')?1:0),turn=(kd('a','arrowleft')?1:0)-(kd('d','arrowright')?1:0);
 deliverT=Math.max(0,deliverT-dt);if(deliverT>0){fwd=0;turn=0;}
 const camR=new THREE.Vector3().crossVectors(camF,P).normalize(); // screen-right on the tangent plane
 const mv=new THREE.Vector3().addScaledVector(camF,fwd).addScaledVector(camR,-turn);
 if(nightDone){nightDoneT+=dt;scene.userData.nightDoneT=nightDoneT;const lo=scene.userData.lightsOut||(scene.userData.lightsOut={keep:scene.userData.deliveredTonight||[]});
  if(skipPending!==3&&(skipPending===2||(nightDoneT>=ND_LEN+0.1&&ndLine&&nightDoneT>=ndLineT+5)||nightDoneT>=22)) /* dawn at 14 s, later only if the lights-out line needs its 5 s */{skipNight=true;skipPending=3;} // k reached 1 on the previous frame -> dawn
  if(skipPending===1){lo.k=1;skipPending=2;}else if(skipPending===0){lo.k=Math.min(1,nightDoneT/20);if(nightDoneT>=ND_LEN)lo.k=1; /* daynight 36e37716: k/20 ramp -> all lamps out at 9.3 s */}
  if(!ndLine&&skipPending===0&&nightDoneT>=1&&((!protPending()&&((!toastQ.length&&toastHold<=0&&T-toastEndT>=0.5)||nightDoneT>=9))||(nightDoneT>=10&&(shownTier!=='prot'||toastHold<=0||T-toastShownT>=Math.min(2.5,minRead(lastShown))))||nightDoneT>=11) /* by 10 s; a protected line on screen first gets its min read time */){ndLine=true;ndLineT=nightDoneT; /* previous line gone 0.5 s, or 9 s at the latest; never cuts a protected line */toast(TXT[LANG][nightN>=NIGHTS_TOTAL-1?'lastEnd':'lightsOut'],'pin');toastHold=Math.max(toastHold,5);state.toastT=Math.max(5,state.toastT);} /* line on at 8–10 s, held >=5 s */ // courier walks back toward the start (post office) by himself
  if(P.angleTo(START)*R>1.5){mv.copy(START).sub(P.clone().multiplyScalar(P.dot(START))).normalize().multiplyScalar(0.55);}}
 const moving=mv.lengthSq()>0.01;
 if(moving){mv.normalize();idleT=0;const ang=Math.atan2(new THREE.Vector3().crossVectors(F,mv).dot(P),F.dot(mv));const tr=THREE.MathUtils.clamp(ang*10,-TURN*2.2,TURN*2.2);tvel+=(tr-tvel)*(1-Math.exp(-12*dt));}else{idleT+=dt;tvel*=Math.exp(-12*dt);}
 F.applyAxisAngle(P,tvel*dt);
 vel+=((moving?SPEED*Math.max(0.2,F.dot(moving?mv:F)):0)-vel)*(1-Math.exp(-(moving?6:9)*dt));
 if(Math.abs(vel)>1e-3){axis.crossVectors(P,F).normalize();const ang=vel*dt/R;P.applyAxisAngle(axis,ang).normalize();F.applyAxisAngle(axis,ang);}
 for(const o of obstacles){if(o.off)continue;const a=P.angleTo(o.dir);if(a<o.rad){tmp.copy(P).sub(o.dir.clone().multiplyScalar(P.dot(o.dir))).normalize();P.copy(o.dir).multiplyScalar(Math.cos(o.rad)).addScaledVector(tmp,Math.sin(o.rad)).normalize();}}
 if(!areaOpen){const a=P.angleTo(AREA),lim=AREA_R+0.25/R;if(a<lim){tmp.copy(P).sub(AREA.clone().multiplyScalar(P.dot(AREA))).normalize();P.copy(AREA).multiplyScalar(Math.cos(lim)).addScaledVector(tmp,Math.sin(lim)).normalize();}}
 F.sub(tmp.copy(P).multiplyScalar(F.dot(P))).normalize();
 const sp=Math.abs(vel)/SPEED;walkPh+=dt*10*sp;const sw=Math.sin(walkPh)*sp;
 heroLegs[0].rotation.x=sw*0.7;heroLegs[1].rotation.x=-sw*0.7;heroArms[0].rotation.x=-sw*0.6;heroArms[1].rotation.x=sw*0.6;if(deliverT>0){const w=Math.sin((0.6-deliverT)/0.6*Math.PI);heroArms[1].rotation.x=-2.4*w;heroArms[1].rotation.z=0.3*Math.sin(T*18)*w;}else heroArms[1].rotation.z=0;
 hop=Math.max(0,hop-dt);const hp=P.clone().multiplyScalar(surf(P)+Math.sin(hop/0.45*Math.PI)*0.35*(hop>0?1:0)+Math.abs(Math.sin(walkPh))*0.05*sp);
 hero.position.copy(hp);const X=new THREE.Vector3().crossVectors(P,F);hero.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,P,F));hero.rotateZ(-tvel*0.04*sp);hero.rotateX(0.08*sp*Math.sign(vel));
 // camera follow
 if(idleT>0.6)camF.lerp(F,1-Math.exp(-1.6*dt));camF.sub(tmp.copy(P).multiplyScalar(camF.dot(P))).normalize();
 let near=0;for(const h of houses){const dd=P.angleTo(h.userData.dir)*R;if(dd<3)near=Math.max(near,1-dd/3);}
 const want=hp.clone().addScaledVector(P,4.45+near*0.9+sp*0.3).addScaledVector(camF,-(5.1+sp*0.8+near*0.4));
 if(!camInit){camPos.copy(want);camUp.copy(P);camInit=true}
 {let lift=0;if(!window.__noLift)for(const o of treeList){const d=o.position.distanceTo(want)-0.4;if(d<1.4)lift=Math.max(lift,(1.4-d)*1.1);}want.addScaledVector(P,lift);} // don't park the camera inside a canopy
 let shotW=0,shotLook=null;if(camShot>0){camShot-=dt;const s=ss(0,0.6,2.6-camShot)*ss(0,0.6,camShot); /* D: 0.6 s ease in/out */const hu=herHouse.userData;const wp=herHouse.localToWorld(new THREE.Vector3(hu.w*0.22,hu.h*0.6,hu.d/2));const nrm=herHouse.localToWorld(new THREE.Vector3(hu.w*0.22,hu.h*0.6,hu.d/2+1)).sub(wp).normalize();
  const rgt=herHouse.localToWorld(new THREE.Vector3(hu.w*0.22+1,hu.h*0.6,hu.d/2)).sub(wp).normalize();let side=1;{const hs=hp.clone().sub(wp).dot(rgt);side=hs>0?-1:1;} // swing to the side away from the courier so he doesn't cover the sill
  if(!shotCW||camShot>2.5){let best=-1;const up=wp.clone().normalize();for(const sd of [side,-side])for(const hh of [1.5,2.4])for(const dn of [2.6,3.4]){const c=wp.clone().addScaledVector(nrm,dn).addScaledVector(rgt,1.1*sd).addScaledVector(up,hh);const seg=wp.clone().sub(c);const tt=THREE.MathUtils.clamp(hp.clone().sub(c).dot(seg)/seg.lengthSq(),0,1);const off=hp.clone().sub(c.clone().addScaledVector(seg,tt)).length();const sc=Math.min(off,1.6)+Math.min(hp.distanceTo(c),4)*0.5;if(sc>best){best=sc;shotCW=c;}}}
  const cw=shotCW.clone();want.lerp(cw,s); /* D: pick the sill viewpoint that keeps the courier off the camera->sill line and >=~3 m away; fixed for the whole shot */ /* D: higher + wider so the courier sits low/small, not in front of the sill */shotW=s;shotLook=wp;}
 if(nightDone&&camShot<=0&&skipPending===0&&nightDoneT>=8.6){const hu=herHouse.userData;const wp=herHouse.localToWorld(new THREE.Vector3(hu.w*0.22,hu.h*0.6,hu.d/2));const nrm=herHouse.localToWorld(new THREE.Vector3(hu.w*0.22,hu.h*0.6,hu.d/2+1)).sub(wp).normalize();const rgt=herHouse.localToWorld(new THREE.Vector3(hu.w*0.22+1,hu.h*0.6,hu.d/2)).sub(wp).normalize();const up=wp.clone().normalize();
  const cw=wp.clone().addScaledVector(nrm,2.4).addScaledVector(rgt,0.95).addScaledVector(up,0.55);
  if(ndPush===null)ndPush={far:true,cw0:wp.clone().addScaledVector(nrm,6.5).addScaledVector(rgt,1.5).addScaledVector(up,2.6),snapped:false};
  if(ndPush.far){const f=ss(8.6,9.0,nightDoneT)*(1-ss(9.05,9.5,nightDoneT));fadeEl.style.opacity=f; /* far from her house: 0.4 s dip to dark, then ease in from a wide shot of the house (no cross-planet fly-through) */
   if(nightDoneT>=9.0){if(!ndPush.snapped){ndPush.snapped=true;try{if(typeof np.onPushStart==='function')np.onPushStart();}catch(e){console.warn(e);}try{if(DN&&typeof DN.onPushStart==='function')DN.onPushStart();}catch(e){console.warn(e);} /* v6.3 hooks: nightProgress (àṣẹ) then daynight (Ìtùtù) */camPos.copy(ndPush.cw0);pushClear(ndPush.cw0,cw,wp);}const s=ss(9,13,nightDoneT);want.copy(ndPush.cw0).lerp(cw,s);shotW=1;shotLook=wp;}}
  else{const s=ss(9,13,nightDoneT);if(s>0){want.lerp(cw,s);want.setLength(Math.max(want.length(),surf(want.clone().normalize())+2.0));shotW=s;shotLook=wp;}}} /* 9–13 s: ease toward the windowsill keepsakes */
 // v5 (FIX-CAMERA port): ray from the courier's head to the wanted camera spot; a roof/wall/canopy in between pulls the camera in front of it
 let occl=false;if(shotW<0.05){const head=hp.clone().addScaledVector(P,1.45);const dv=want.clone().sub(head);const L=dv.length();camRay.set(head,dv.normalize());camRay.far=L;
  const hits=camRay.intersectObjects(camOccl.filter(o=>o.visible),true).filter(x=>x.object.visible&&x.object.isMesh&&!x.object.userData.noOcclude&&x.object.name!=='window');
  if(hits.length){const d=Math.max(1.0,hits[0].distance-0.3);want.copy(head).addScaledVector(dv,d);occl=true;}}
 const k=1-Math.exp(-(shotW>0?7:occl?10:4)*dt);camPos.lerp(want,k);camPos.setLength(Math.max(camPos.length(),R+1.2,surf(camPos.clone().normalize())+(shotW>0?1.0:0)));if(shotW>0&&shotLook){for(let it=0;it<12;it++){let blocked=false;for(let j=1;j<8;j++){const q=camPos.clone().lerp(shotLook,j/8);if(q.length()<surf(q.clone().normalize())+0.35){blocked=true;break;}}if(!blocked)break;camPos.setLength(camPos.length()+0.3);}} /* J: keep the camera->sill sightline above the hills */camUp.copy(P);
 nudge.multiplyScalar(Math.exp(-5*dt));camera.position.copy(camPos).add(nudge.clone().multiplyScalar(Math.abs(Math.sin(T*20))));{const dv=camPos.clone().sub(hp);if(dv.length()<3.2&&!occl){const tgt=hp.clone().addScaledVector(dv.normalize(),3.2);camPos.lerp(tgt,(1-shotW)*(1-Math.exp(-6*dt)));camera.position.copy(camPos);}} /* D: ease the min-distance push instead of snapping when a shot ends */camera.up.copy(camUp);if(shotLook)camera.up.lerp(shotLook.clone().normalize(),shotW).normalize();{const lk=hp.clone().addScaledVector(P,0.8).addScaledVector(camF,1.2+sp*0.8);if(shotLook){lk.lerp(shotLook,shotW);lk.setLength(Math.max(lk.length(),surf(lk.clone().normalize())+0.6));}camera.lookAt(lk); /* J: look target travels over the surface, never into the planet */
 {const wpp=new THREE.Vector3();if(shotW>0.3&&!ndPush){for(const o of planet.children){if(o===herHouse||o.userData.noOcclude||letters.includes(o)||o===fenceNote||!o.visible&&!pushHidden.has(o))continue;o.getWorldPosition(wpp);const near=wpp.distanceTo(camera.position)<3.2||(wpp.clone().addScaledVector(wpp.clone().normalize(),1.2).distanceTo(camera.position)<2.6);if(near&&o.visible){o.visible=false;pushHidden.add(o);}}}else if(pushHidden.size&&!ndPush){pushHidden.forEach(o=>o.visible=true);pushHidden.clear();}} /* M: props right in front of the sill-shot camera are hidden for the shot */
 if(shotW>0.3&&!ndPush){if(!pushWires){pushWires=[];planet.traverse(o=>{if(o.isMesh&&o.geometry.type==='TubeGeometry')pushWires.push({o,pts:o.geometry.parameters.path.getPoints(16)});});}
  const v=new THREE.Vector3();for(const w of pushWires){if(!w.o.visible)continue;let dmin=1e9;for(const q of w.pts){v.copy(q).applyMatrix4(w.o.matrixWorld);dmin=Math.min(dmin,v.distanceTo(camera.position));}if(dmin<4){w.o.visible=false;pushHidden.add(w.o);}}
  for(const m of wireLanterns){if(m.visible){m.getWorldPosition(v);if(v.distanceTo(camera.position)<4){m.visible=false;pushHidden.add(m);}}}} /* M: string-light wires/lanterns crossing the push frame too */
 }
 // v5: never let the camera sink into the ground or a canopy (flat green frame)
 {const cd=camera.position.clone().normalize();const cl=surf(cd)+0.6;if(camera.position.length()<cl)camera.position.setLength(cl);
  for(const o of treeList){const c=o.position.clone().addScaledVector(o.position.clone().normalize(),o.userData.s||1.3);const dv=camera.position.clone().sub(c);const r=1.05;if(dv.length()<r)camera.position.copy(c).addScaledVector(dv.lengthSq()>1e-6?dv.normalize():cd,r);}}
 // sun follows the player so the local area is always lit (planet is tiny)
 const side=new THREE.Vector3().crossVectors(P,Math.abs(P.z)<0.9?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0)).normalize();
 const sd=P.clone().multiplyScalar(PH>1.2&&PH<2.6?0.55:0.8).addScaledVector(side,0.55).normalize();
 sun.position.copy(hp).addScaledVector(sd,25);sun.target.position.copy(hp);sun.target.updateMatrixWorld();
 // letters
 if(M>=3&&nightOpen()&&letterNight!==nightN&&state.targets.length){letterNight=nightN;const q=quota();while(letters.length<q)spawnLetter();letters.slice(0,Math.min(q,3)).forEach(L=>letterNear(L,P));for(const L of letters)if(!letterOK(L.userData.dir)){let d=randDir();for(let k=0;k<200&&!letterOK(d);k++)d=randDir();L.userData.dir=d;}beamNearest();} /* no letter left at a recipient's door */ /* bug 2: night-open letters within reach */
 if(M>=3&&nightOpen()&&!nightDone&&state.carry===0&&lettersNeeded()>0){emptyT+=dt;
  const ahead=l=>{const v=l.userData.dir.clone().sub(P);return v.length()*R<5&&v.normalize().dot(F)>0.3;};
  if(emptyT>3&&!letters.some(ahead)){const L=letters.reduce((a,b)=>a.userData.dir.angleTo(P)<b.userData.dir.angleTo(P)?a:b);const ax=new THREE.Vector3().crossVectors(P,F).normalize();
   let ok=false;for(const dist of [3.5,2.5,5])for(const yaw of [0,0.4,-0.4,0.8,-0.8,1.3,-1.3,2,-2,3.1]){if(ok)break;const ax2=ax.clone().applyAxisAngle(P.clone().normalize(),yaw);const d=P.clone().normalize().applyAxisAngle(ax2,dist/R).normalize();if(letterOK(d)){L.userData.dir=d;ok=true;}}if(!ok)letterNear(L,P);guideBeam(L);emptyT=0;}}
 else emptyT=0; /* v6.2 C: empty bag while letters are owed -> after 3 s a letter lands ~3.5 m ahead of wherever the player is heading (manual walkers too) */
 for(const L of [...letters]){const d=L.userData.dir;L.position.copy(d).multiplyScalar(surf(d)+0.55+Math.sin(T*2+L.userData.ph)*0.08);L.quaternion.setFromUnitVectors(UP,d);L.rotateY(T*1.5+L.userData.ph);
  const need=M>=3?lettersNeeded():3;L.visible=state.carry<need&&(M<3||nightOpen()); /* L/K: letters appear (and can be picked up) only from dusk */
  if(L.visible&&P.angleTo(d)*R<2.5){if(state.carry<3){state.carry++;if(nightN===1&&!state.seedShown){state.seedShown=true;toast(TXT[LANG].seed);} /* night-2 setup for the knock: letters are unaddressed, so it plays on the first pickup of night 2 */hop=0.35;lastProgT=T;planet.remove(L);letters.splice(letters.indexOf(L),1);spawnLetter();if(M>=3)beamNearest();burst(L.position.clone(),d);}
   else if(state.shown<=0){pop(TXT[LANG].full,L.position);state.shown=4;}}}
 state.shown-=dt;
 for(const h of [...state.targets]){const mk=markers.get(h);mk.visible=nightOpen()&&!clueOn();mk.rotation.y=T*2;{const dd=P.angleTo(h.userData.dir)*R;const k=THREE.MathUtils.clamp(1-(dd-2)/6,0,1);mk.userData.ring.visible=nightOpen()&&(state.carry>0||h.userData.knock)&&!clueOn();mk.userData.ring.scale.setScalar(1+0.05*Math.sin(T*6)*k);mk.scale.setScalar(1+0.6*k);}mk.position.y=h.userData.top+0.9+Math.sin(T*3)*0.12;
  if(nightOpen()&&(state.carry>0||h.userData.knock)&&P.angleTo(h.userData.dir)*R<2.5){deliverT=0.6;nudge.copy(P).multiplyScalar(0.12);h.userData.win.userData.u.uGlow.value=1.5;if(!h.userData.knock)state.carry--;state.delivered++;state.deliveredNight=(state.deliveredNight||0)+1;window.PaperEcho.deliveredThisNight.push(houses.indexOf(h));hop=0.45;h.userData.doneN=true;h.userData.done=true;h.userData.glowT=1.6;
   h.remove(mk);h.remove(mk.userData.ring);markers.delete(h);{const rm=roofMarkers[houseId(h)];if(rm&&N2()){rm.delivered=true;try{window.onMarkerDelivered?.(houseId(h));}catch{/* optional hook */}}}state.targets.splice(state.targets.indexOf(h),1);
   const line=recipientLine(h);lastLine=line;/* v6.7: night-2 nudge line removed (user feedback) */if(M>=3&&(state.deliveredNight||0)>=quota()){dropLastOne();dropDeliv(true);}setTimeoutSim(()=>toast(line,'deliv'),0.45);lastDeliverT=T;lastProgT=T;lastRealDeliverT=T;h.userData.knock=false;if(M>=3?(state.deliveredNight>=quota()):h===herHouse){np.onDelivered();if(M>=3){state.holdNight=true;beginFenceBeat();}else if(pendingKeep){const k=pendingKeep;setTimeoutSim(()=>{camShot=2.6;const n=KEEP_NOTE[k.id];toast((n?n[LANG]:k[LANG]));pendingKeep=null;},toastDur(lastLine)+0.5);}}
   burst(h.position.clone().addScaledVector(h.userData.dir,h.userData.top),h.userData.dir,30);pop('★',h.position.clone().addScaledVector(h.userData.dir,h.userData.top+0.5));chooseTarget();}}
 for(const h of houses){if(h.userData.glowT!=null){h.userData.glowT=Math.max(0,h.userData.glowT-dt);const q=h.userData.glowT/1.6;const g=q>0?0.9*q*q:0;
  h.userData.win.userData.u.uGlow.value=g;h.userData.win.userData.u.uLit.value=1;}}
 for(const b of [...bursts]){b.userData.life-=dt;b.position.addScaledVector(b.userData.v,dt);b.userData.v.addScaledVector(b.position.clone().normalize(),-4*dt);b.rotation.x+=b.userData.spin.x*dt;b.rotation.y+=b.userData.spin.y*dt;b.scale.setScalar(Math.max(0.01,b.userData.life)*(b.userData.scl||1));
  if(b.userData.life<=0){scene.remove(b);bursts.splice(bursts.indexOf(b),1);}}
 if(topT>0){topT-=dt;if(topT<=0)topEl.style.opacity=0;}
 if(!nightDone&&M>=3&&state.holdNight&&postBeat!=='fence'&&(state.deliveredNight||0)>=quota()&&T-lastRealDeliverT>=2)startNightDone(); /* lights-out starts ~2 s after the last delivery; protected lines keep playing over it */ /* lights-out begins once the last protected line is on screen (it finishes over nightDone's first seconds) */ /* E: ~2 s after the last delivery; wait only while keepsake/fence lines play (cap 13 s) */ // cap: at most 6 s after the last delivery/fence beat
 if(toastHold>0){toastHold-=dt;if(toastHold<=0){toastEndT=T;subEnd();if(toastQ.length)showToast(toastQ.shift());}}paceTick();
 if(toastBeat){toastBeat.t-=dt;if(toastBeat.t<=0){$('toast').innerHTML=toastBeat.full;toastBeat=null;}}
 if(state.toastT>0){state.toastT-=dt;if(state.toastT<=0)$('toast').style.opacity=0;}
  {let best=null,bd=1e9;for(const h of state.targets){if(!nightOpen()||!(state.carry>0||h.userData.knock))continue;const a=P.angleTo(h.userData.dir);if(a<bd){bd=a;best=h.userData.dir;}}
  if(postBeat==='fence'&&fenceNote){best=fenceNote.userData.dir;bd=P.angleTo(best);}
  guide.visible=!!best&&bd*R>2.2&&(postBeat==='fence'||arrowAllowed());if(guide.visible){const t=best.clone().sub(P.clone().multiplyScalar(P.dot(best))).normalize();const gq=P.clone().applyAxisAngle(new THREE.Vector3().crossVectors(P,t).normalize(),(2.2+0.12*Math.sin(T*4))/R);const gp=gq.clone().multiplyScalar(surf(gq)+0.06);
   guide.position.copy(gp);guide.up.copy(P);guide.lookAt(gp.clone().add(t));}}
  for(const c of cranes){if(!c.found&&c.g.visible){c.g.rotation.y+=dt*0.8;if(P.angleTo(c.dir)*R<0.9){c.found=true;found++;if(found===1||found===10)toast(CRANE_LINES[LANG][found===1?0:1],'hint');topPop((LANG==='zh'?'纸鹤 ':'Cranes ')+found+'/'+craneCap()+(found===craneCap()?' ✓':''));burst(c.g.position.clone().addScaledVector(c.dir,0.8),c.dir,6,0.5);planet.remove(c.g);}}}
  for(const h of houses)if(h.userData.kite){h.userData.kite.rotation.y=T;h.userData.kite.position.x=Math.sin(T*0.7+houses.indexOf(h))*0.4;}
 if(openT>=0){openT+=dt;const k=Math.min(1,openT/1.2);const e=1+Math.sin(k*Math.PI)*0.15;for(const o of closedProps)o.scale.setScalar(Math.max(0.01,k*e));if(k>=1){closedProps.forEach(o=>o.scale.setScalar(1));openT=-1;}}
 {const one=M>=3&&nightOpen()&&state.targets.length===1;if(one)pillarH=state.targets[0];pillarA=one?Math.min(1,pillarA+dt/0.6):Math.max(0,pillarA-dt/0.6);if(!nightOpen())pillarA=0;
  pillar.visible=pillarA>0.001&&!!pillarH&&arrowAllowed();pillar.material.uniforms.uOp.value=(0.325+0.075*Math.sin(T*6.2832/2.4))*pillarA; // breathe 0.25..0.4 every 2.4 s, 0.6 s fade in/out
  if(pillar.visible){const h=pillarH;const u=h.userData;h.userData.win.userData.u.uLit.value=1;const dp=h.localToWorld(new THREE.Vector3(-u.w*0.25,0,u.d/2+0.35));const dd=dp.clone().normalize();pillar.position.copy(dd).multiplyScalar(surf(dd));pillar.quaternion.setFromUnitVectors(UP,dd);}
  if(one&&(state.deliveredNight||0)<quota()){const h=state.targets[0];if(!said['lastOne'+nightN]&&state.toastT<=0){said['lastOne'+nightN]=1;toast(TXT[LANG].lastOne(h.userData.person.name[LANG]),'hint');}}}
 // v6.1 failsafe: a commission can't be finished (bag empty, no progress for 90 s of open night) -> drop it and run the night-done sequence
 if(M>=3&&nightOpen()&&state.targets.length&&!nightDone){
  if(lettersNeeded()>state.carry&&state.carry===0&&!letters.some(l=>l.visible)){spawnLetter(P.clone());guideBeam(letters[letters.length-1]);} // no visible letter left -> drop one near the courier
  if(state.carry===0&&T-lastProgT>90){const last=nightN>=NIGHTS_TOTAL-1;state._failName=state.targets.map(t=>t.userData.person.name[LANG]).join(LANG==='zh'?'、':', ');for(const t of [...state.targets]){const mk=markers.get(t);t.remove(mk);t.remove(mk.userData.ring);markers.delete(t);
   if(last){state.deliveredNight=(state.deliveredNight||0)+1;state.delivered++;t.userData.done=true;window.PaperEcho.deliveredThisNight.push(houses.indexOf(t));}else carryOver.push(t.userData.person.name.zh);}
   state.targets.length=0;state.holdNight=true;console.warn('failsafe: night forced done');const fn=(state._failName||'');toast(TXT[LANG][last?'failLeave':'failCarry'](fn));if(last)np.onDelivered();const n0=nightN;setTimeoutSim(()=>{if(nightN===n0)startNightDone();},toastDur(TXT[LANG].failCarry(fn))+0.5);}}
 else lastProgT=T;
 updateNightLights();if(typeof npBack!=='undefined'&&npBack)npBack.visible=npBack.material.opacity>0.25;{const hs=document.getElementById("hint").style;const o=(T<5||waitDark())?"1":"0";if(hs.opacity!==o)hs.opacity=o;}
 hero.userData.noOcclude=true;if(OCC&&OCC.updateOcclusion){try{OCC.updateOcclusion(camera,hero,scene);}catch(e){OCC=null;}}
 np.update(dt);
 if(T>0.5)say('open');
 // (dawnLeft removed: the night holds while letters remain, so it fired while time was frozen)
 if(postBeat==='done'&&!nightDone&&T-lastDeliverT>16)startNightDone();
 if(postBeat==='fence'&&fenceNote){const d=fenceNote.userData.dir;fenceNote.position.copy(d).multiplyScalar(surf(d)+0.55+Math.sin(T*2.4+fenceNote.userData.ph)*0.06);fenceNote.quaternion.setFromUnitVectors(UP,d);fenceNote.rotateY(T*1.2);if(P.angleTo(d)*R<2.6)completeFenceBeat();}
 if(M>=2&&T-lastDeliverT>35&&!said['lost'+Math.floor(T/60)]){said['lost'+Math.floor(T/60)]=1;toast(TXT[LANG].lost,'hint');}
 post.uniforms.time.value=T;hud();prompts();hintTick();clueHud();
}
// courier is never dithered: when occlusion.js has an occluder masked, the courier is drawn again on top (layer 1, depth cleared), so the 30% kept canopy dots can't cover him
let heroLayer=false;function heroOnTop(){if(!heroLayer){hero.traverse(o=>o.layers.enable(1));[sun,hemi,...winLights].forEach(l=>l.layers.enable(1));heroLayer=true;}
 const f=window.__occ&&window.__occ.faded?window.__occ.faded():[];if(!f.length)return;const au=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;renderer.autoClear=false;renderer.clearDepth();camera.layers.set(1);renderer.render(scene,camera);camera.layers.set(0);renderer.autoClear=true;renderer.shadowMap.autoUpdate=au;}
function render(){renderer.setRenderTarget(rt);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);heroOnTop();if(GLOW>0)bloom();renderer.setRenderTarget(null);renderer.render(pscene,ocam);}
// scripted-play helper: which keys a simple player would hold to reach the next goal
let apLast=P.clone(),apT=0,apEsc=0;window.autoKeys=()=>{if(M>=3&&nightN>=NIGHTS_TOTAL)return [];if(nightDone)return nightDoneT>(window.__ndWait??99)?['n']:[];/* N only during nightDone — pressing earlier skips the lights-out walk */if(toastQ.length&&!window.__apNoWait)return []; /* autopilot waits for queued dialogue like a reading player */apT+=1/24;if(apEsc>0){apEsc-=1/24;return ['w','d'];}if(apT>1.5){if(P.angleTo(apLast)*R<0.6)apEsc=0.9;apLast.copy(P);apT=0;}let goal=null,best=1e9;const consider=(d)=>{const a=P.angleTo(d);if(a<best){best=a;goal=d}};
 if(postBeat==='fence'&&fenceNote){goal=fenceNote.userData.dir;best=-1;}
 if(postBeat!=='fence'&&state.carry<3)letters.forEach(l=>{if(l.visible)consider(l.userData.dir)});
 if(postBeat!=='fence'&&nightOpen()&&state.targets.length&&(state.carry>0||state.targets[0].userData.knock)&&(state.carry>=Math.min(3,lettersNeeded())||state.targets[0].userData.knock)){best=-1;goal=state.targets[0].userData.dir;}
 if(postBeat!=='fence'&&state.carry>0&&nightOpen()&&best>=0){const b0=best;state.targets.forEach(h=>{const a=P.angleTo(h.userData.dir);if(a<b0*1.6||state.carry>=2){if(a<best||goal==null||state.carry>=2){best=a;goal=h.userData.dir}}});}
 if(postBeat!=='fence'&&state.carry>0&&nightOpen()&&arrowH&&state.targets.includes(arrowH)){goal=arrowH.userData.dir;best=-1;} /* v6.6: autopilot follows the locked arrow like a reading player (was: letter detours + targets[last]) */
 if(postBeat!=='fence'){let cb=null,ca=6/R;cranes.forEach(c=>{if(!c.found&&c.g.visible){const a=P.angleTo(c.dir);if(a<ca){ca=a;cb=c.dir;}}});if(cb){goal=cb;best=ca;}} /* detour for a crane within 6 m */
 if(postBeat!=='fence'&&(!goal||(state.targets.length===0)||(!nightOpen()&&state.carry>=Math.min(3,lettersNeeded())))){goal=null;best=1e9;cranes.forEach(c=>{if(!c.found&&c.g.visible)consider(c.dir)});}if(!goal)return [];const t=goal.clone().sub(P.clone().multiplyScalar(P.dot(goal))).normalize();const ang=Math.atan2(new THREE.Vector3().crossVectors(F,t).dot(P),F.dot(t));
 const cr=new THREE.Vector3().crossVectors(camF,P).normalize();const gx=t.dot(cr),gz=t.dot(camF);let bestK=[],bs=-2;
 for(const [k,x,z] of [[['w'],0,1],[['w','d'],.707,.707],[['d'],1,0],[['s','d'],.707,-.707],[['s'],0,-1],[['s','a'],-.707,-.707],[['a'],-1,0],[['w','a'],-.707,.707]]){const s=x*gx+z*gz;if(s>bs){bs=s;bestK=k;}}return bestK;};
// debug: stand 2.2m in front of the i-th tree, facing away, so the follow camera sits behind/inside it (occlusion test)
window.skipTo=(ph)=>{tOff+=(((ph-PH)%3+3)%3)/3*CYCLE;return ph;};
window.debugFrame=()=>{camera.updateMatrixWorld();const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const v=new THREE.Vector3();const out=[];for(const o of planet.children){if(!o.visible)continue;o.getWorldPosition(v);const dd=v.distanceTo(camera.position);if(dd<9&&fr.containsPoint(v)){const nm=[];o.traverse(c=>{if(c.name)nm.push(c.name)});out.push([dd.toFixed(1),o.name||o.type,nm.slice(0,4).join('/')]);}}return out;};window.debugFrame2=()=>{camera.updateMatrixWorld();const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const v=new THREE.Vector3();const out={};scene.traverse(o=>{if(!o.isMesh||!o.visible)return;let vis=true;for(let q=o;q;q=q.parent)if(!q.visible){vis=false;break;}if(!vis)return;o.getWorldPosition(v);const dd=v.distanceTo(camera.position);if(dd<20&&fr.containsPoint(v)){const ch=[];for(let q=o;q&&q!==scene;q=q.parent)ch.push((q.name||q.type)+(q.geometry?':'+q.geometry.type:''));const k=ch.slice(0,3).join('<');out[k]=(out[k]||0)+1;}});return out;};window.debugLamps=()=>{camera.updateMatrixWorld();const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const v=new THREE.Vector3();const out=[];planet.traverse(o=>{if(o.name==='lamp_pole'){const g=o.parent;g.getWorldPosition(v);if(fr.containsPoint(v)||fr.containsPoint(v.clone().addScaledVector(v.clone().normalize(),1.7)))out.push([+v.distanceTo(camera.position).toFixed(1),g.visible,g.parent===planet,pushHidden.size]);}});return out;};window.debugBeams=()=>letters.filter(l=>l.userData.beam&&l.visible).length;window.debugBeamDist=()=>{const v=new THREE.Vector3();return letters.filter(l=>l.userData.beam&&l.visible).map(l=>{l.getWorldPosition(v);return +v.distanceTo(camera.position).toFixed(1)});};window.debugLetterDoor=()=>Math.min(99,...letters.filter(l=>l.visible).flatMap(l=>state.targets.map(h=>l.userData.dir.angleTo(h.userData.dir)*R)));window.debugToast=()=>[shownTier,String(lastShown).replace(/<[^>]+>/g,' '),toastQ.length,toastHold>0,$('toast').style.opacity];
window.debugND=()=>{const u=scene.userData;if(!u.nightDone)return null;let on=0;scene.traverse(o=>{if(o.isMesh&&/^(window|lamp)/.test(o.name)&&o.material&&o.material.userData&&o.material.userData.todOn>0.5)on++});const wp=new THREE.Vector3();herHouse.getWorldPosition(wp);let lampsIn=0;{const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const v=new THREE.Vector3();planet.traverse(o=>{if(o.name==='lamp_pole'&&o.parent&&o.parent.visible){o.getWorldPosition(v);if(fr.containsPoint(v)&&v.distanceTo(camera.position)<6)lampsIn++;}});}return [u.nightDoneT,on,camera.position.distanceTo(wp),$('toast').innerText.slice(0,8),$('toast').style.opacity,lampsIn];};
window.debugShot=()=>{camShot=2.6;return 1;};
window.debugKeep=()=>{np.onDelivered();return 1;};
window.debugAtHer=(dd=3.2,tg=false)=>{const HH=tg&&state.targets[0]?state.targets[0]:herHouse;const w=HH.localToWorld(new THREE.Vector3(0,0,HH.userData.d/2+dd));P.copy(w).normalize();const hd=HH.userData.dir;F.copy(hd).sub(P.clone().multiplyScalar(P.dot(hd))).normalize();camF.copy(F);camInit=false;return 1;};
window.debugBehindTree=(i=0,dd=2.2)=>{const trees=planet.children.filter(o=>o.userData.isTree);const tr=trees[i%trees.length];const d=tr.position.clone().normalize();
 const tg=new THREE.Vector3(1,0,0).sub(d.clone().multiplyScalar(d.x)).normalize();P.copy(d).applyAxisAngle(new THREE.Vector3().crossVectors(d,tg).normalize(),dd/R).normalize();
 F.copy(P.clone().sub(d).sub(P.clone().multiplyScalar(P.dot(P.clone().sub(d))))).normalize();camF.copy(F);camInit=false;return trees.length;};
/* ===== v6.8 night-2 clue trial (night 2 = nightN===1 only) ===== */
const HINT1_IDLE_S=4,HINT2_IDLE_S=8; /* no progress toward the held letter's recipient for 4 s -> hint level 1 hook (marker brighter, Ìtùtù); 8 s -> hint level 2 (arrow shows) */
const N2=()=>M>=3&&nightN===1;
const roofMarkers={};window.roofMarkers=roofMarkers; /* roofMarkers[houseId]={house,group,light,kind,delivered}; light = the glowing point mesh (light.material.userData.u.uGlow = brightness, default 1) */
function houseId(h){return h.userData.person?h.userData.person.name.zh:'house'+houses.indexOf(h);}
window.houseIdOf=houseId;
{const KIND={'小满':'telescope','阿汀':'boatString','米婆婆':'lantern','老周':'wellLamp','豆豆':'envelopePole'};
 const mk=(geo,hex,pos,rot)=>{const m=new THREE.Mesh(geo,toon(S.lampmetal,{hex}));m.position.set(...pos);if(rot)m.rotation.set(...rot);m.userData.noOcclude=true;return m;};
 const lightM=(hex,r,pos)=>{const mat=toon(S.lamp,{kind:5,hex});mat.userData.u.uGlow.value=1;mat.userData.u.uCol.value.set(hex);mat.userData.u.uUseCol.value=1;mat.userData.fallbackHex=hex; /* colour owned by daynight.js (window.MARKER_COLOR[name] -> uCol); hex here is only the fallback. uGlow is written by daynight.js, set once here */const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),mat);m.position.set(...pos);m.userData.noOcclude=true;m.name='roofMarkerLight';return m;};
 for(const h of [...houses.filter(x=>x.userData.person&&KIND[x.userData.person.name.zh])]){const u=h.userData,id=houseId(h),kind=KIND[id],g=new THREE.Group(); /* only the five recipients */g.name='roofMarker';const ry=u.top; /* ridge height (house local) */let light;
  if(kind==='telescope'){g.add(mk(new THREE.CylinderGeometry(0.02,0.02,0.75,5),0x5b4a3c,[0,ry+0.37,0]));const tube=mk(new THREE.CylinderGeometry(0.05,0.07,0.6,10),0xc9ccd2,[0.12,ry+0.88,0],[0,0,-0.9]);g.add(tube);light=lightM(0xe8f0ff,0.07,[0.36,ry+1.07,0]);} /* cold white */
  else if(kind==='boatString'){const zz=u.d/2;for(const z of [-zz,zz])g.add(mk(new THREE.CylinderGeometry(0.018,0.02,1.0,5),0x5b4a3c,[0,ry-0.15+0.5,z]));const line=mk(new THREE.CylinderGeometry(0.006,0.006,u.d,3),0x373f42,[0,ry+0.3,0],[Math.PI/2,0,0]);g.add(line);
   for(const k of [-0.3,0,0.3]){const b=mk(new THREE.ConeGeometry(0.07,0.09,4),0xf6efe2,[0,ry+0.22,k*u.d],[Math.PI,0,0]);g.add(b);}light=lightM(0xffe9a0,0.06,[0,ry+0.36,0]);} /* small light-yellow lamp on the string */
  else if(kind==='lantern'){g.add(mk(new THREE.CylinderGeometry(0.018,0.025,1.4,6),0x7a9a52,[0,ry+0.6,0]));for(const y of [0.25,0.6,0.95])g.add(mk(new THREE.CylinderGeometry(0.024,0.024,0.025,6),0x5f7d40,[0,ry-0.1+y,0]));light=lightM(0xff9a3c,0.1,[0.0,ry+1.25,0]);light.scale.set(1,1.25,1);g.add(mk(new THREE.ConeGeometry(0.08,0.06,6),0x8a3a2a,[0,ry+1.4,0]));} /* warm orange flower lantern */
  else if(kind==='envelopePole'){g.add(mk(new THREE.CylinderGeometry(0.014,0.018,1.1,5),0x5b4a3c,[0,ry+0.45,0]));g.add(mk(new THREE.BoxGeometry(0.34,0.24,0.03),0xf6efe2,[0,ry+1.05,0]));light=lightM(0xffb3d1,0.07,[0,ry+1.05,0.03]);} /* glowing envelope on a thin pole, light pink */
  else if(kind==='wellLamp'){light=lightM(0x8fe3d0,0.07,[0,0,0]);} /* lamp on the well roof (attached below) */
  else{g.add(mk(new THREE.CylinderGeometry(0.015,0.02,0.9,5),0x5b4a3c,[0,ry+0.3,0]));g.add(mk(new THREE.BoxGeometry(0.16,0.1,0.01),0xd9c9a8,[0.09,ry+0.6,0]));light=lightM(0xffcf6a,0.05,[0,ry+0.8,0]);} /* placeholder vane */
  g.add(light);g.visible=false;for(const c of g.children)c.position.y-=ry;if(kind==='wellLamp'&&u.well){g.position.y=1.15;g.scale.setScalar(2.2);u.well.add(g);}else{g.position.y=ry;g.scale.setScalar(2.4);h.add(g);} /* pivot at the ridge, scaled up so it reads above the horizon from across the neighbourhood */roofMarkers[id]={house:h,group:g,light,kind,delivered:false};}}
function markerColours(){const MC=window.MARKER_COLOR;if(!MC)return;for(const id in roofMarkers){const c=MC[id];if(c!=null){try{roofMarkers[id].light.material.userData.u.uCol.value.set(c);}catch{/* marker not built yet */}}}}
let CLUES=null;window.night2Clues=()=>CLUES;
(async()=>{for(const url of ['copy/night2-clues.json','../copy/night2-clues.json','../../copy/night2-clues.json']){try{const r=await fetch(url,{cache:'no-store'});if(r.ok){const j=await r.json();if(j&&typeof j==='object'){CLUES=j;console.log('night2 clues from',url);return;}}}catch{/* try next path */}}})(); /* {houseId: clue}; missing file -> old behaviour */
function clueFor(h){if(!CLUES||!h)return null;const C=CLUES.clues||CLUES;const c=C[houseId(h)];return typeof c==='string'?c:null;} /* keys = recipient names (HOF(name)) */
function keepsakeReply(h){if(!CLUES||!CLUES.keepsakeReply||!N2())return null;const nm=houseId(h),line=CLUES.keepsakeReply[nm];if(typeof line!=='string')return null;let k=null;try{const N=window.nightProgress||np;k=N&&typeof N.keepsakeFor==='function'?N.keepsakeFor(nm):null;}catch(e){k=null;}if(k==null)return null;if(typeof k==='object')k=k.name||k.zh||k.id;return line.split('{keepsake}').join(String(k));} /* {keepsake} <- nightProgress.keepsakeFor(name); null -> original reply */ /* night 2: replaces this recipient's reply (same line count) when àṣẹ's nightProgress recorded a night-1 keepsake for them */
const clueOn=()=>N2()&&!!CLUES&&!nightDone; /* clue mode active */
const hintSt={tgt:null,best:1e9,progT:0,h1:false,h2:false,carry:0};window.hintState=()=>({house:hintSt.tgt?houseId(hintSt.tgt):null,idle:+(T-hintSt.progT).toFixed(2),level:hintSt.h2?2:hintSt.h1?1:0});
window.hintLog=[];
const __pp=new THREE.Vector3(),tmpPP=new THREE.Vector3();window.__playerPos=__pp;let mcDone=false;
function hintTick(){ /* per frame */
 __pp.copy(hero.getWorldPosition(tmpPP));window.__playerPos=__pp;
 if(!mcDone&&window.MARKER_COLOR){markerColours();mcDone=true;}
 for(const id in roofMarkers){const r=roofMarkers[id];r.group.visible=N2()&&nightOpen()&&r.group.parent.visible;}
 if(!clueOn()||!(state.carry>0)||!arrowH){hintSt.tgt=null;hintSt.h1=hintSt.h2=false;hintSt.carry=state.carry;return;}
 const d=P.angleTo(arrowH.userData.dir)*R;
 if(arrowH!==hintSt.tgt||(hintSt.carry===0&&state.carry>0)){hintSt.tgt=arrowH;hintSt.best=d;hintSt.progT=T;hintSt.h1=hintSt.h2=false;}
 hintSt.carry=state.carry;
 if(d<hintSt.best-0.5){hintSt.best=d;hintSt.progT=T;}
 const idle=T-hintSt.progT,id=houseId(arrowH);
 if(!hintSt.h1&&idle>=HINT1_IDLE_S){hintSt.h1=true;window.hintLog.push({level:1,house:id,t:+T.toFixed(2)});try{window.onHintLevel1?.(id);}catch(e){console.warn(e);}}
 if(!hintSt.h2&&idle>=HINT2_IDLE_S){hintSt.h2=true;window.hintLog.push({level:2,house:id,t:+T.toFixed(2)});try{window.clearHint?.(id);}catch(e){console.warn(e);}try{window.onHintLevel2?.(id);}catch(e){console.warn(e);}}}
const arrowAllowed=()=>!clueOn()||hintSt.h2;
window.debugLetters=()=>letters.filter(l=>l.visible).map(l=>l.getWorldPosition(new THREE.Vector3()).toArray()); /* what a player can see: letter positions */
window.debugView=()=>({p:P.toArray(),f:camF.toArray()});
window.gameState=()=>({nightDone,tq:toastQ.length,postBeat,night:nightN,quota:quota(),dn:state.deliveredNight||0,targets:state.targets.map(h=>h.userData.person&&h.userData.person.name.zh),areaOpen,crCap:craneCap(),tod:todIdx(),occ:window.__occ?window.__occ.faded():null,found,carry:state.carry,delivered:state.delivered,ph:PH,nights:nightN,np:np.state});
window.__force=(o={})=>{if(o.ph!=null){tOff=o.ph/3*CYCLE-T;PH=((T+tOff)/CYCLE*3)%3;prevPH=PH;}if(o.dn!=null)state.deliveredNight=o.dn;if(o.carry!=null)state.carry=o.carry;if(o.night!=null)nightN=o.night;if(o.finished)window.PaperEcho.finished=true;if(o.toast)toast(o.toast);hud();return window.gameState();};

window.tick=(dt)=>{step(dt);render();};window.stepOnly=(dt)=>step(dt);
if(M>=3)startNight();
camOccl=[...houses]; // trees are handled by occlusion.js (see-through hole); only roofs/walls pull the camera in
window.debugWindows=()=>houses.map((h,i)=>{const n=[];h.traverse(o=>{if(o.isMesh&&o.material===h.userData.win)n.push(o.name||'(unnamed)');});const u=h.userData.win.userData.u;return {i,her:h===herHouse,visible:h.visible,names:n,on:+Math.max(u.uOn.value,u.uLit.value).toFixed(2)};});
step(0);render();hud();window.ready=true;
if(!CAPTURE){let last=performance.now();(function loop(){const n=performance.now();window.tick(Math.min(0.05,(n-last)/1000));last=n;requestAnimationFrame(loop)})();}
