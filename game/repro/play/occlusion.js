// occlusion.js — screen-space circular see-through cutout around the player (v2, àṣẹ).
//
// One export: updateOcclusion(camera, player, scene[, bufferSize]) — call once per frame
// after the camera is placed, before render.
//  * Raycast camera -> player CENTER (chest). Only objects hit strictly in front of the
//    player (hit distance < player distance - FRONT_PAD) become occluders; the house
//    behind the player during the delivery push-in is never hit, so it stays solid.
//  * Occluders get a circle mask in screen space: center = projected chest, radius =
//    RADIUS_K x the player's on-screen height, last SOFT (20%) of the radius ramps back
//    to solid. Inside, pixels are DISCARDED with a 4x4 Bayer pattern (2px cells), keeping
//    KEEP (58%) coverage. Discard happens in the same MRT draw that writes the
//    outline G-buffer (color.a = id, gInfo = depth/normal/contribution), so outlines are
//    cut by exactly the same mask — there is no separate outline pass to patch.
//  * Inside the circle, surviving occluder pixels, the ground and instanced grass zero their outline
//    contribution (gInfo.a) — outlines are simply dropped inside the circle, never dithered, so the dots don't each get a dark ring (the "dirty ground
//    patch" look of v1). Unmasked meshes (the player) keep their outlines.
//  * Player subtree is never patched (explicit insideOf(player) + userData.noOcclude).
import * as THREE from 'three';

const KEEP     = 0.30;  // v4: coverage at the inner edge of the dither ring (ramps to 1 at the rim)
const INNER    = 0.75;  // v4.1 (was 0.60)
const GRASS_HEX = 0x3f6b4a, RING_TINT = 0.4; // v4.1: kept ring pixels tinted toward grass so dots don't stack into a dark crescent
//  // v4: inner fraction of the radius that is fully cut (no dither)
const LINE_HEX = 0x373f42, LINE_ALPHA = 0.5; // v4: faint 1px silhouette line kept inside the cut (50% = 1px checker)
const HEAD     = 1.05;  // v4: second ray target; hole only if chest or head ray is blocked
const RADIUS_K = 1.5;   // circle radius = this x player's on-screen height
const LEGS     = 0.25;  // v4.4: legs ray
const MIN_RAYS = 2;     // v4.4: rays that must be blocked to cut
const CENTER   = 0.6;   // v4.3: circle centre height (as v4.1)
const CHEST    = 0.8;   // v4.4: chest ray (counts toward MIN_RAYS)
//   // aim/centre height above player origin (local up)
const HEIGHT   = 1.2;   // player height used for on-screen size
const FRONT_PAD= 0.6;   // occluder must be at least this much nearer than the player
const IN_RATE  = 9.0;   // uOcclude units/s toward target — full in ~0.08s
const OUT_RATE = 4.5;   // restore units/s — full restore ≈0.16s (< 0.2s spec)
const MIN_DIST = 0.6;   // camera nearer than this → nothing can occlude
const RESCAN_S = 0.6;   // seconds between candidate-mesh rescans
const DOT_PX   = 2.0;   // Bayer cell size in device pixels

// shared mask uniforms (one set for every patched material)
const U = { uOccC: { value: new THREE.Vector2(-1e4, -1e4) }, uOccR: { value: 1 }, uOccInner: { value: INNER }, uOccKeep: { value: KEEP }, uOccAny: { value: 0 },
  uOccLine: { value: new THREE.Color(LINE_HEX) }, uOccLineA: { value: LINE_ALPHA },
  uOccGrass: { value: new THREE.Color(GRASS_HEX) }, uOccTint: { value: RING_TINT } }; // Color(hex) -> linear, matches the scene buffer
const DECL = `\nuniform float uOcclude,uOccR,uOccInner,uOccKeep,uOccAny,uOccLineA;uniform vec2 uOccC;uniform vec3 uOccLine,uOccGrass;uniform float uOccTint;float _occT;bool _occRim=false;\nfloat occB2(vec2 a){a=floor(a);return fract(a.x*0.5+a.y*a.y*0.75);}\nfloat occBayer(vec2 a){return occB2(a*0.5)*0.25+occB2(a);}\n`;
// v4: r = d/R. r < INNER: occluder fully cut (no dither) except a 1px, 50%-checker silhouette line.
// INNER..1: coverage ramps KEEP -> 1 with 4x4 Bayer dots. Ground/grass: outline contribution dropped inside.
const BODY = `\n{float _r=distance(gl_FragCoord.xy,uOccC)/uOccR;_occT=1.0-smoothstep(uOccInner,1.0,_r);
#ifndef OCC_GROUND
_occT*=uOcclude;
if(_occT>0.0009){
 float keep=_r<uOccInner?0.0:mix(uOccKeep,1.0,smoothstep(uOccInner,1.0,_r));keep=mix(1.0,keep,uOcclude);
 float b=occBayer(floor(gl_FragCoord.xy/${DOT_PX.toFixed(1)}));
 if(b>=keep){
#if defined(OCC_RIM)
  float ndv=abs(dot(normalize(vNormal),normalize(vViewPosition)));float w=fwidth(ndv);
  vec2 q=floor(gl_FragCoord.xy);bool chk=mod(q.x+q.y,2.0)<1.0;
  if(ndv<w*1.2&&chk&&uOcclude>0.5&&uOccLineA>0.0)_occRim=true;else discard;
#else
  discard;
#endif
 }}
#else
_occT*=uOccAny;
#endif
}\n`;
const TAIL = `\n#ifdef USE_OCC_GINFO\nif(_occRim){gl_FragColor.rgb=uOccLine;gInfo.a=0.0;}else{gInfo.a*=1.0-_occT;
#ifndef OCC_GROUND
if(_occT>0.0009)gl_FragColor.rgb=mix(gl_FragColor.rgb,uOccGrass,uOccTint*_occT);
#endif
}\n#endif\n`;
const MAIN_RE = /void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/;

const PATCHABLE = m => !!m && (m.isMeshLambertMaterial || m.isMeshPhongMaterial ||
  m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshToonMaterial ||
  m.isMeshBasicMaterial || m.isMeshDepthMaterial);

const ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const _c = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion();
const _o2 = new THREE.Vector3(); // scratch ray origin (kept off _c — castRay uses it)
const _pass = [];                    // candidates surviving the sphere prefilter
let cands = [];                      // {mesh, bs, root}
let candOf = new Map();              // mesh -> cand
let cull = null;                     // auto-detected ground mesh ("planet")
let groups = new Map();              // occluder root -> fade state
let lastMs = -1, nextScan = 0, lastRays = {};
const _t2 = new THREE.Vector3();
let DEBUG_HITS = typeof location !== 'undefined' && /occdebug/.test(location.search);

const insideOf = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
const noOcc = o => { for (let p = o; p; p = p.parent) if (p.userData && p.userData.noOcclude) return true; return false; };
const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
// fade unit = the ancestor sitting just below the world container (the ground
// mesh's parent — the planet group), or just below the scene for loose meshes.
// Tree canopy blob → whole tree; house wall → whole house; lone mesh → itself.
function topOf(o, scene) {
  const stop = (cull && cull.parent) || scene;
  let r = o;
  while (r.parent && r.parent !== stop && r.parent !== scene) r = r.parent;
  return r;
}

function scan(scene, player) {
  cands = []; candOf = new Map();
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (insideOf(o, player) || noOcc(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some(PATCHABLE)) return;
    const g = o.geometry; if (!g) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingSphere) return;
    const c = { mesh: o, bs: g.boundingSphere, root: topOf(o, scene) };
    cands.push(c); candOf.set(o, c);
  });
}

// sphere-prefiltered raycast: tests per-mesh world bounding spheres, then does
// a precise triangle raycast only on the few that can be hit.
function castRay(origin, dir, far) {
  _pass.length = 0;
  for (const c of cands) {
    const m = c.mesh;
    if (!shown(m)) continue;
    _c.copy(c.bs.center).applyMatrix4(m.matrixWorld);
    const wr = c.bs.radius * m.matrixWorld.getMaxScaleOnAxis();
    const tx = _c.x - origin.x, ty = _c.y - origin.y, tz = _c.z - origin.z;
    const tca = tx * dir.x + ty * dir.y + tz * dir.z;
    if (tca + wr < 0 || tca - wr > far) continue;
    if (tx * tx + ty * ty + tz * tz - tca * tca > wr * wr) continue;
    _pass.push(m);
  }
  if (!_pass.length) return [];
  ray.set(origin, dir); ray.near = 0; ray.far = far;
  return ray.intersectObjects(_pass, false);
}

// the surface under the player is the ground — pick the biggest hit by world
// bounding-sphere radius so a bush/rock underfoot can't steal the tag. Runs
// once on the first call (full-scene cast; candidates aren't built yet).
function findGround(scene, player) {
  player.getWorldQuaternion(_q); _up.set(0, 1, 0).applyQuaternion(_q);
  player.getWorldPosition(_o2).addScaledVector(_up, 1.5);
  _d.copy(_up).negate();
  ray.set(_o2, _d); ray.near = 0; ray.far = 6;
  let best = null, br = 1;
  for (const h of ray.intersectObjects(scene.children, true)) {
    const o = h.object;
    if (!o.isMesh || o.isInstancedMesh || insideOf(o, player) || !shown(o)) continue;
    const bs = o.geometry && o.geometry.boundingSphere;
    if (!bs) continue;
    const wr = bs.radius * o.matrixWorld.getMaxScaleOnAxis();
    if (wr > br) { br = wr; best = o; }
  }
  cull = best; // stays null → retried next call
}

// clone + patch a source material: discard uOcclude-fraction of pixels in a
// 4x4 Bayer pattern. The original onBeforeCompile is chained so existing
// injections (toon G-buffer writes, window tint, …) keep working.
function inject(shader, ground) {
  const f = shader.fragmentShader;
  let out = (f.includes('#include <common>') ? f.replace('#include <common>', '#include <common>' + DECL) : DECL + f).replace(MAIN_RE, x => x + BODY);
  if (/\bgInfo\b/.test(out)) { const k = out.lastIndexOf('}'); out = out.slice(0, k) + TAIL + out.slice(k); out = '#define USE_OCC_GINFO\n' + out; }
  if (ground) out = '#define OCC_GROUND\n' + out;
  else if (/varying\s+vec3\s+vNormal/.test(out) && /varying\s+vec3\s+vViewPosition/.test(out)) out = '#define OCC_RIM\n' + out;
  shader.fragmentShader = out;
}
function patch(src, ground = false) {
  const u = { value: ground ? 1 : 0 };
  const m = src.clone();
  const inner = src.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    inner.call(m, shader, renderer);
    Object.assign(shader.uniforms, U); shader.uniforms.uOcclude = u;
    inject(shader, ground);
  };
  m.customProgramCacheKey = () => (ground ? 'occg:' : 'occ:') + src.uuid;
  if (src.userData && src.userData.u) m.userData.u = src.userData.u;
  return { mat: m, u, src };
}
let groundDone = false; const groundPatches = []; // [{mesh, e}]

// prune-aware traversal: fn(o)===false skips the whole subtree.
function walk(o, fn) {
  if (fn(o) === false) return;
  for (const c of o.children) walk(c, fn);
}

function applyGroup(g, player) {
  walk(g.root, o => {
    if (o.userData && o.userData.noOcclude) return false;
    if (insideOf(o, player)) return false;
    if (o.isMesh && !o.isInstancedMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map(src => {
        if (!PATCHABLE(src)) return src;
        let e = g.mats.get(src);
        if (!e) { e = patch(src); g.mats.set(src, e); }
        return e.mat;
      });
      g.saved.set(o, o.material);
      o.material = Array.isArray(o.material) ? out : out[0];
    }
    return true;
  });
  g.applied = true;
}

function restoreGroup(g) {
  for (const [o, src] of g.saved) o.material = src;
  g.saved.clear();
  g.applied = false;
}

export function updateOcclusion(camera, player, scene, bufferSize) {
  try {
    const now = performance.now();
    const dt = lastMs < 0 ? 0.016 : Math.min(0.1, (now - lastMs) / 1000);
    lastMs = now;
    scene.updateMatrixWorld();
    if (!cull) findGround(scene, player);   // before scan: topOf() uses cull.parent
    if (now >= nextScan) { scan(scene, player); nextScan = now + RESCAN_S * 1000; }

    camera.getWorldPosition(_o);
    player.getWorldQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    player.getWorldPosition(_t).addScaledVector(_up, CENTER);
    _d.copy(_t).sub(_o);
    const dist = _d.length();

    // circle centre/radius in drawing-buffer pixels (gl_FragCoord space, origin bottom-left)
    let bw = bufferSize && bufferSize.x, bh = bufferSize && bufferSize.y;
    if (!bw && typeof document !== 'undefined') { const cv = document.querySelector('canvas'); if (cv) { bw = cv.width; bh = cv.height; } }
    if (bw) {
      const pc = _c.copy(_t).project(camera); const cx = (pc.x * 0.5 + 0.5) * bw, cy = (pc.y * 0.5 + 0.5) * bh;
      player.getWorldPosition(_o2); const pf = _o2.project(camera); const fy = (pf.y * 0.5 + 0.5) * bh, fx = (pf.x * 0.5 + 0.5) * bw;
      player.getWorldPosition(_o2).addScaledVector(_up, HEIGHT); const ph = _o2.project(camera);
      const hpx = Math.hypot((ph.x * 0.5 + 0.5) * bw - fx, (ph.y * 0.5 + 0.5) * bh - fy);
      U.uOccC.value.set(cx, cy); U.uOccR.value = Math.max(8, RADIUS_K * hpx);
    }
    // "ground-type" patch (outline contribution only, no discard): the planet + instanced grass
    if (cull && !groundDone) { groundDone = true;
      const list = [cull]; scene.traverse(o => { if (o.isInstancedMesh && !insideOf(o, player) && !noOcc(o)) list.push(o); });
      for (const mesh of list) if (PATCHABLE(mesh.material)) { const e = patch(mesh.material, true); mesh.material = e.mat; groundPatches.push({ mesh, e }); }
    }
    const hitRoots = new Set(); const rays = {}; const perRay = [];
    // v4.4: cut only if >= 2 of 3 rays (legs, chest, head) are blocked; union of their occluders
    for (const [name, hgt] of [['legs', LEGS], ['chest', CHEST], ['head', HEAD]]) {
      player.getWorldPosition(_t2).addScaledVector(_up, hgt); _d.copy(_t2).sub(_o); const dd = _d.length(); rays[name] = 0;
      const roots = new Set(); perRay.push(roots);
      if (dd <= MIN_DIST) continue; _d.divideScalar(dd);
      for (const h of castRay(_o, _d, Math.max(0, dd - FRONT_PAD))) {
        const c = candOf.get(h.object);
        if (!c || h.object === cull || c.root === cull) continue;
        roots.add(c.root); rays[name]++;
        if (DEBUG_HITS) { const sp = h.point.clone().project(camera); (rays.hits ||= []).push({ ray: name, obj: h.object.geometry && h.object.geometry.type, root: c.root.userData && c.root.userData.isTree ? 'tree' : (c.root.name || c.root.type), dist: +h.distance.toFixed(2), of: +dd.toFixed(2), sx: +sp.x.toFixed(3), sy: +sp.y.toFixed(3) }); }
      }
    }
    rays.blocked = perRay.filter(r => r.size).length;
    if (rays.blocked >= MIN_RAYS) for (const r of perRay) for (const x of r) hitRoots.add(x);
    lastRays = rays;
    for (const g of groups.values()) g.target = false;
    for (const r of hitRoots) {
      let g = groups.get(r);
      if (!g) { g = { root: r, value: 0, target: true, applied: false, mats: new Map(), saved: new Map() }; groups.set(r, g); }
      g.target = true;
    }
    for (const [r, g] of [...groups]) {
      const goal = g.target ? 1 : 0;
      const dv = (g.target ? IN_RATE : OUT_RATE) * dt;
      g.value += Math.abs(goal - g.value) <= dv ? goal - g.value : Math.sign(goal - g.value) * dv;
      if (g.value > 0.0005) {
        if (!g.applied) applyGroup(g, player);
        for (const e of g.mats.values()) {
          e.u.value = g.value;
          if (e.src.color) e.mat.color.copy(e.src.color);                       // palette slot updates
          if (e.src.emissive && e.mat.emissive) e.mat.emissive.copy(e.src.emissive);
        }
      } else if (!g.target) {
        if (g.applied) restoreGroup(g);
        groups.delete(r);
      }
    }
    { let mx = 0; for (const g of groups.values()) mx = Math.max(mx, g.value); U.uOccAny.value = mx; }
    for (const gp of groundPatches) if (gp.e.src.color) gp.e.mat.color.copy(gp.e.src.color);
    if (typeof window !== 'undefined') window.__occ = { rays: () => lastRays, playerPatched: () => { let n = 0; player.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.customProgramCacheKey && String(m.customProgramCacheKey()).startsWith('occ:')) n++; }); return n; }, patchedMeshes: () => [...groups.values()].reduce((a, g) => a + g.saved.size, 0), faded: () => [...groups.values()].filter(g => g.value > 0.02).map(g => ({ name: g.root.name || g.root.type, v: +g.value.toFixed(3) })) };
  } catch (e) {
    if (!updateOcclusion._w) { console.warn('updateOcclusion:', e); updateOcclusion._w = 1; }
  }
}
