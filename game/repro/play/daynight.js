// daynight.js — time-of-day for Paper Echo play build (ported from art/palette-test/main.js setTod).
// API:  import { applyTimeOfDay } from './daynight.js';  applyTimeOfDay(scene, tod)   // tod 0=day 1=dusk 1.5=blue hour 2=night
// Self-contained: loads palette-{day,dusk,night}.png itself (top-level await), finds lights/windows/lamps in `scene`.
// Windows: meshes named /^window/i (e.g. "window", "window_light_3").  Lamps: meshes named /^lamp/i except /^lamp_?(pole|metal)/i.
// NOT touched: anything under an ancestor named 'nightProgress' or 'herHouse', or with material.userData.glow===true (nightProgress.js owns her window + fence lamps).
// Optional scene.userData hooks (all optional, only used if present):
//   post      : ShaderMaterial with uniforms uSkyTop,uSkyHor,uCloud,uLine (Vector3|Color), uGlow, uNightK
//   glowMax   : bloom strength at night (default 1.2)
//   palReg    : [{color:THREE.Color, slot:int}]  extra colours to re-tint from the palette (slot=row*16+col)
//   uNight    : {value} uniform for a night-shading term (0..1)
import * as THREE from 'three';
const BASE=new URL('../palettes/',import.meta.url);
async function loadPal(n){const img=new Image();img.src=new URL(`palette-${n}.png`,BASE).href;await img.decode();
 const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,16,16).data;}
const PALS=await Promise.all(['day','dusk','night'].map(loadPal));
export const SLOT={window_glass:24,window_light:64,lamp_glow:65,lamp_metal:66,sky_top:80,sky_horizon:81,fog_near:82,cloud:84,outline:85,hemi_sky:86,hemi_ground:87,sun_light:88};
export const OWNED_RE=/^(nightProgress|herHouse)$/; // subtrees owned by àṣẹ's nightProgress.js — never switched here
const owned=o=>{if(o.material&&o.material.userData&&o.material.userData.glow===true)return true;for(let p=o;p;p=p.parent)if(p.name&&OWNED_RE.test(p.name))return true;return false;};
export const WINDOW_RE=/^window/i, LAMP_RE=/^lamp(?!_?(pole|metal))/i;
const ss=(a,b,x)=>{x=Math.min(Math.max((x-a)/(b-a),0),1);return x*x*(3-2*x);};
function rgb(slot,t){const i=slot*4,c=k=>[0,1,2].map(j=>PALS[k][i+j]/255);const a=c(0),b=c(1),n=c(2);
 return t<1?a.map((v,j)=>v+(b[j]-v)*ss(0,1,t)):b.map((v,j)=>v+(n[j]-v)*ss(1,2,t));}
const tmp=new THREE.Color();
function col(slot,t){const c=rgb(slot,t);return tmp.setRGB(c[0],c[1],c[2],THREE.SRGBColorSpace);}
const BH_TOP=new THREE.Color().setRGB(0.16,0.25,0.55,THREE.SRGBColorSpace)/*#29408C*/,BH_HOR=new THREE.Color().setRGB(0.42,0.45,0.72,THREE.SRGBColorSpace)/*#6B73B8*/;
function setU(u,c){if(!u)return;const v=u.value;if(v.isColor)v.copy(c);else if(v.isVector3)v.set(c.r,c.g,c.b);}
// v6.3 push flash: game.js calls onPushStart() when the windowsill push begins; kept (delivered) windows go 1.0->1.4 from 0.6s, back to 1.0 by 1.4s
let pushT0=-1;export function onPushStart(){pushT0=performance.now();}
function pushFlash(){if(pushT0<0)return 1;const e=(performance.now()-pushT0)/1000;if(e>1.5){pushT0=-1;return 1;}return 1+0.4*(e<0.75?ss(0.6,0.75,e):1-ss(0.75,1.4,e));}
export function applyTimeOfDay(scene,tod){
 const t=Math.min(Math.max(+tod||0,0),2);const ud=scene.userData;const bh=Math.sin(Math.PI*ss(1,2,t));
 const switches=[];
 scene.traverse(o=>{
  if(o.isDirectionalLight)o.color.copy(col(SLOT.sun_light,t));
  else if(o.isHemisphereLight){o.color.copy(col(SLOT.hemi_sky,t));o.groundColor.copy(col(SLOT.hemi_ground,t));}
  else if(o.isMesh&&o.name&&(WINDOW_RE.test(o.name)||LAMP_RE.test(o.name))&&!owned(o))switches.push(o);});
 if(scene.fog)scene.fog.color.copy(col(SLOT.fog_near,t)).lerp(BH_HOR,bh*0.4);
 if(scene.background&&scene.background.isColor)scene.background.copy(col(SLOT.sky_horizon,t)).lerp(BH_HOR,bh*0.6);
 // staggered switch-on: per-light t0=0.8+k*0.44, 0.06 fade (k = hashed order); materials shared by several meshes switch together
 const mats=[...new Set(switches.map(m=>m.material))];const N=mats.length;
 mats.forEach((m,i)=>{const k=(i*7919%N)/Math.max(N-1,1);const t0=0.8+k*(0.5-0.06);let on=ss(t0,t0+0.06,t);
  // lights-out epilogue: scene.userData.lightsOut={k:0..1, keep:[house Object3D...]}; houses not in keep switch off staggered as k rises
  const LO=ud.lightsOut;if(LO&&LO.k>0){const owner=switches.find(s=>s.material===m);let kept=false;if(owner&&LO.keep)for(let p=owner;p;p=p.parent)if(LO.keep.includes(p)){kept=true;break;}
   if(kept&&owner&&WINDOW_RE.test(owner.name))on*=pushFlash();
   if(!kept){const s0=0.1+((i*104729)%N)/Math.max(N,1)*0.75;on*=1-ss(s0,s0+0.08,Math.min(1,LO.k*2));}}
  m.userData.todOn=on;
  if(m.userData.u&&m.userData.u.uOn)m.userData.u.uOn.value=on;          // game.js toon() materials
  else if(m.emissive){const lamp=switches.find(s=>s.material===m&&LAMP_RE.test(s.name));
   m.emissive.copy(col(lamp?SLOT.lamp_glow:SLOT.window_light,t)).multiplyScalar(on);}});
 if(ud.palReg)for(const r of ud.palReg)r.color.copy(col(r.slot,t));
 if(ud.uNight)ud.uNight.value=ss(1.05,1.7,t); // dusk keeps its warm light; the night dim/shade term only comes in after the sun is down
 const glow=(ud.glowMax??1.2)*ss(0.7,1.7,t);const p=ud.post&&ud.post.uniforms;
 if(p){setU(p.uSkyTop,col(SLOT.sky_top,t).lerp(BH_TOP,bh*0.6));setU(p.uSkyHor,col(SLOT.sky_horizon,t).lerp(BH_HOR,bh*0.6));
  setU(p.uCloud,col(SLOT.cloud,t));setU(p.uLine,col(SLOT.outline,t));if(p.uGlow)p.uGlow.value=glow;if(p.uNightK)p.uNightK.value=ss(1.5,1.85,t);}
 try{updateMarkers(scene,t);}catch(e){console.warn('roofMarkers',e);}
 return {tod:t,glow,lights:N,blueHour:bh};}

// ---- v7 rooftop markers (night-2 trial; markers built by sun in game.js) ----
// Interface: window.roofMarkers[houseId].light  (THREE.Light, or Mesh whose material has uniforms uOn/uCol, emissive, or color+opacity).
//   houseId = person zh name ('小满'…), en name ('Xiaoman'…), or anything else; entry may also carry .name (zh) / .house (house Group).
//   Missing/undefined entries are tolerated and picked up on the frame they appear (applyTimeOfDay runs every frame).
// Delivered this night  = house Group userData.doneN===true (game.js sets it on delivery, clears at nightEnd) -> 30%.
// window.onHintLevel1(id): pulse 1.6x..2.2x (1.6 s period) until clearHint(id) / delivery / player within 3 m (if window.__playerPos is
//   provided as a world-space Vector3) / auto-timeout 4 s after the hint (= when game.js shows the arrow at 8 s stuck).
export const MARKER_COLOR={'小满':'#dfe9ff','阿汀':'#ffe7a0','米婆婆':'#ffab52','老周':'#8fe3d0','豆豆':'#ffb3d1'};
const EN2ZH={Xiaoman:'小满',Ting:'阿汀','Granny Mi':'米婆婆','Old Zhou':'老周',Doudou:'豆豆'};
export const MARKER_BASE=1.0, MARKER_DELIVERED=0.3, HINT_NEAR_M=3, HINT_TIMEOUT_S=4;
const hints=new Map(); // id -> t0 (ms)
const now=()=>performance.now();
export function clearHint(id){if(id===undefined)hints.clear();else hints.delete(id);}
if(typeof window!=='undefined')window.onHintLevel1=id=>{hints.set(id,now());};
if(typeof window!=='undefined'){window.clearHint=clearHint;const prev2=window.onHintLevel2;window.onHintLevel2=id=>{clearHint(id);if(prev2)prev2(id);};} // arrow appears -> back to normal
const mcol=new THREE.Color();
export const HALO_X=2;
export function setMarkerLight(L,k,hex){if(!L)return;mcol.set(hex||'#ffffff');
 if(L.isLight){if(L.userData.baseI==null)L.userData.baseI=L.intensity||1;L.intensity=L.userData.baseI*k;L.color.copy(mcol);return;}
 if(L.scale){if(!L.userData.baseS)L.userData.baseS=L.scale.clone();L.scale.copy(L.userData.baseS).multiplyScalar(HALO_X*(0.8+0.2*k));} // halo 2x, hint pulse also grows size
 const ms=L.material?(Array.isArray(L.material)?L.material:[L.material]):[];
 for(const m of ms){const u=(m.userData&&m.userData.u)||m.uniforms;
  if(u&&u.uGlow){u.uGlow.value=k;if(u.uCol)setU(u.uCol,mcol);continue;} // game.js v6.8 roofMarkerLight: toon kind5, uGlow = brightness (default 1)
  if(u&&(u.uOn||u.uCol)){if(u.uOn)u.uOn.value=k;if(u.uCol)setU(u.uCol,mcol);continue;}
  if(m.emissive){m.emissive.copy(mcol).multiplyScalar(k);if(m.color)m.color.copy(mcol);continue;}
  if(m.color){m.color.copy(mcol).multiplyScalar(Math.min(1,k));if(k>1)m.color.multiplyScalar(k);m.transparent=true;m.opacity=Math.min(1,k);}}
 L.visible=k>0.001;}
const _hp=new THREE.Vector3();
function updateMarkers(scene,t){if(typeof window!=='undefined'&&window.__dnDebug)window.__dnScene=scene; // test-only hook
const RM=typeof window!=='undefined'&&window.roofMarkers;if(!RM)return;
 const byName={};scene.traverse(o=>{const p=o.userData&&o.userData.person;if(p&&p.name)byName[p.name.zh]=o;});
 const night=ss(0.8,1.3,t);const tm=now();
 for(const id of Object.keys(RM)){const e=RM[id];if(!e||!e.light)continue;
  const zh=e.name||EN2ZH[id]||id;const h=e.house||byName[zh];const hex=MARKER_COLOR[zh]||'#ffe7a0';
  let k=MARKER_BASE*night;const done=!!(e.delivered||(h&&h.userData.doneN));if(done)k*=MARKER_DELIVERED;
  const hk=hints.has(id)?id:hints.has(zh)?zh:null;
  if(hk!=null){const el=(tm-hints.get(hk))/1000;let near=false;
   if(h&&window.__playerPos){h.getWorldPosition(_hp);near=_hp.distanceTo(window.__playerPos)<HINT_NEAR_M;}
   if(done||near||el>HINT_TIMEOUT_S)hints.delete(hk);
   else k*=1.9+0.3*Math.sin(el*2*Math.PI/1.6);} // 1.6x..2.2x, 1.6 s period
  setMarkerLight(e.light,k,hex);}}
