// nightProgress.js — Paper Echo "after the delivery" layer (fresh code, no deps beyond three).
// Owns: window lamp (#ffcf6a) + glow, one new keepsake per night inside the house,
// one more fence lamp per finished night, and night persistence (localStorage).
// sun's game keeps pickup/delivery; it just calls onDelivered() and advanceNight().
import * as THREE from 'three';

export const LAMP_HEX = 0xffcf6a;
export const FENCE_HEX = 0xffcf6a;
export const SILHOUETTE_HEX = 0x373f42; // keepsakes read as dark shapes against the lit window // Ìtùtù night update (was #d97757)
// keepsake order; cycles after the last one
// each keepsake carries the short line its recipient left with it
export const KEEPSAKES = [
  { id: 'boat',   from: '阿汀',   zh: '「借你家窗台晾一晚。……它下午掉进水坑了。」',   en: '"Drying it on your sill tonight. …It fell in a puddle."' },
  { id: 'flower', from: '米婆婆', zh: '「它叫春生。……也可能叫秋生。」',             en: '"This is Spring. …Or Autumn."' },
  { id: 'cup',    from: '老周',   zh: '「泡了两杯，……另一杯是给信的。」',           en: '"Made two cups. …One\'s for the letter."' },
  { id: 'star',   from: '小满',   zh: '「第三百一十二颗。……这颗你帮我记着。」',     en: '"Number 312. …You keep count of this one."' },
];

// Chinese caption names
export const KEEPSAKE_ZH = { boat: '纸船', flower: '小花', cup: '茶杯', star: '纸星星' };

const basic = (hex) => new THREE.MeshLambertMaterial({ color: hex });
const glowMat = (hex) => { const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }); m.userData.glow = true; return m; };

function buildKeepsake(id, mat) {
  const g = new THREE.Group();
  if (id === 'boat') {            // folded hull + sail, all flat planes
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.05, 0.06, 4, 1), mat(0xd9c9a8));
    hull.scale.set(1, 1, 0.45); hull.rotation.y = Math.PI / 4; hull.position.y = 0.03; g.add(hull);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 3), mat(0xd9c9a8)); sail.position.y = 0.11; g.add(sail);
  } else if (id === 'flower') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.07, 8), mat(0xb5603f)); pot.position.y = 0.035; g.add(pot);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), mat(0x4f8a52)); stem.position.y = 0.1; g.add(stem);
    for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), mat(0xf6c6d0)); const a = i / 5 * 6.283;
      p.position.set(Math.cos(a) * 0.025, 0.145, Math.sin(a) * 0.025); g.add(p); }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), mat(0xffd35a)); c.position.y = 0.15; g.add(c);
  } else if (id === 'cup') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.06, 10), mat(0xeef3f0)); cup.position.y = 0.03; g.add(cup);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 4, 8), mat(0xeef3f0)); h.position.set(0.04, 0.032, 0); g.add(h);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), mat(0x9a5a2a)); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.058; g.add(tea);
  } else {                         // star hung from a thread
    const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.03 : 0.07, a = i / 10 * 6.283 + Math.PI / 2;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false }), mat(0xe0a83a)); star.position.y = 0.25; g.add(star);
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.18, 3), mat(0x6b5a48)); th.position.y = 0.41; g.add(th);
  }
  return g;
}

/**
 * createNightProgress(opts)
 *  storageKey  localStorage key (default 'paper_echo_night_progress'); pass null to disable persistence
 *  material    (hex)=>Material for regular surfaces (pass your toon factory to match the build look)
 *  glowMaterial(hex)=>Material for lit surfaces (pass one that writes your glow buffer, e.g. toon kind 5)
 *  lampHex     window lamp colour (default #ffcf6a)
 */
export function createNightProgress(opts = {}) {
  const key = opts.storageKey === undefined ? 'paper_echo_night_progress' : opts.storageKey;
  const mat = opts.material || basic, gmat = opts.glowMaterial || glowMat, lampHex = opts.lampHex ?? LAMP_HEX;
  let saved = { night: 1, finished: 0, deliveredTonight: false, deliveries: [] };
  try { if (key) Object.assign(saved, JSON.parse(localStorage.getItem(key) || '{}')); } catch {}
  const st = saved; const listeners = {}; if (!Array.isArray(st.deliveries)) st.deliveries = [];
  const emit = (e, d) => (listeners[e] || []).forEach(f => f(d));
  const save = () => { try { key && localStorage.setItem(key, JSON.stringify(st)); } catch {} };
  let root = null, lampT = st.deliveredTonight ? 1 : 0, lampOn = st.deliveredTonight, popT = 0;
  const parts = {};
  // drop-in: tonight's new keepsake stays off the sill until onPushStart(); then falls from the window and bounces once.
  // fallback when onPushStart() is never called: advanceNight() (next day) shows it in place, as before.
  let pendingIdx = -1, drop = null; // drop = { k, t, y0, z0, h }
  const DROP_FALL = 0.6, DROP_END = 1.0, DROP_BOUNCE = 0.15;

  function keepsakeCount() { return st.finished + (st.deliveredTonight ? 1 : 0); }

  // anchor: Object3D placed at the house base, +Y up, +Z = front face. dims in house-local units.
  function attach(anchor, dims = {}) {
    const w = dims.width ?? 1.4, h = dims.height ?? 1.1, d = dims.depth ?? 1.1;
    const win = dims.window ?? { x: 0.25 * w, y: 0.55 * h, w: 0.42, h: 0.34 };
    root = new THREE.Group(); root.name = 'nightProgress'; anchor.add(root); anchorRef = anchor;
    // shadowbox room visible through the front window: back wall, table
    const room = new THREE.Group(); room.position.set(win.x, win.y - win.h / 2, d / 2 - 0.02); root.add(room);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(win.w * 1.6, win.h * 1.8), mat(0x3a2e2a)); back.position.set(0, win.h * 0.7, -0.32); room.add(back);
    // lamp light sits BEHIND the keepsakes: a warm panel in front of the dark back wall, faded in by the lamp
    const backLitM = gmat(lampHex); backLitM.transparent = true; backLitM.opacity = 0; backLitM.depthWrite = false;
    const backLit = new THREE.Mesh(new THREE.PlaneGeometry(win.w * 1.6, win.h * 1.8), backLitM); backLit.position.set(0, win.h * 0.7, -0.3); room.add(backLit);
    const table = new THREE.Mesh(new THREE.BoxGeometry(win.w * 1.2, 0.03, 0.22), mat(0x7a5236)); table.position.set(0, 0.02, -0.16); room.add(table);
    // glowing pane (sits just proud of the wall; alpha fades it in)
    const paneM = gmat(lampHex); paneM.transparent = true; paneM.opacity = 0; paneM.depthWrite = false;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), paneM); pane.position.set(win.x, win.y, d / 2 + 0.012); root.add(pane);
    // Ìtùtù sill v3: deeper OUTER sill under the window carries the keepsakes (outside the wall face, camera side)
    const sillW = win.w + 0.5, sillD = 0.2, sillTop = win.y - win.h / 2, sillZ = d / 2 + sillD / 2 - 0.01;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(sillW, 0.04, sillD), mat(0xf3ead8)); sill.position.set(win.x, sillTop - 0.02, sillZ); root.add(sill);
    // spill light + pool on the ground in front
    const light = new THREE.PointLight(lampHex, 0, 5, 2.0) /* Ìtùtù v2: shorter, dimmer spill */; light.position.set(win.x, win.y + win.h / 2 + 0.05, d / 2 + 0.55); // above & in front of the sill so window light falls onto the keepsakes root.add(light);
    const poolM = gmat(lampHex); poolM.transparent = true; poolM.opacity = 0; poolM.depthWrite = false; poolM.userData.glow = false;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), poolM); pool.rotation.x = -Math.PI / 2; pool.position.set(win.x, 0.02, d / 2 + 0.7); pool.scale.set(1, 0.6, 1); root.add(pool);
    // keepsake slots (table, sill, table, hanging)
    // keepsake slots on the OUTER sill, lit, original daytime colours (SILHOUETTE_HEX kept exported for compat only)
    const KS = 1.5, sx = sillW / 2 - 0.07, ky = sillTop + 0.002, kz = sillZ + 0.02;
    const slots = [[win.x - sx, ky, kz], [win.x + sx, ky, kz], [win.x - sx * 0.4, ky, kz], [win.x + sx * 0.4, ky - 0.2, kz + 0.03]];
    const keeps = KEEPSAKES.map((k, i) => { const m = buildKeepsake(k.id, mat); m.position.set(...slots[i]); m.scale.setScalar(KS); m.userData.base = KS; m.visible = false; root.add(m); return m; });
    // small sill lamp keepsake: glows on its own, one step dimmer than the window (1.8)
    const sillLamp = new THREE.Group(); sillLamp.position.set(win.x + sx * 0.05, ky, kz); sillLamp.scale.setScalar(KS); root.add(sillLamp);
    const slOn = gmat(LAMP_HEX); if (slOn.emissive) { slOn.emissive.set(LAMP_HEX); slOn.emissiveIntensity = 1.2; }
    const slBulb = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.045), slOn); slBulb.position.y = 0.03; sillLamp.add(slBulb);
    const slCap = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.03, 4), mat(0x2e2a28)); slCap.position.y = 0.075; slCap.rotation.y = Math.PI / 4; sillLamp.add(slCap);
    sillLamp.visible = false;
    // fence lamps: small posts in an arc in front of the house, lit one per finished night
    const N = dims.fenceLamps ?? 7, lamps = [];
    for (let i = 0; i < N; i++) {
      // two arcs left/right of the front, leaving the walkway to the door clear
      const side = i < N / 2 ? -1 : 1, k = side < 0 ? i : i - Math.ceil(N / 2), cnt = side < 0 ? Math.ceil(N / 2) : Math.floor(N / 2);
      const a = side * (0.75 + 1.3 * k / Math.max(1, cnt - 1)), r = Math.max(w, d) * 0.9 + 0.6;
      const post = new THREE.Group(); post.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); root.add(post);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5), mat(0x5b4a3c)); pole.position.y = 0.27; post.add(pole);
      const offM = mat(0x4a4038), onM = gmat(FENCE_HEX); if (onM.emissive) { onM.emissive.set(FENCE_HEX); onM.emissiveIntensity = 1.2; }
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), offM); bulb.position.y = 0.6; post.add(bulb);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), mat(0x2e2a28)); cap.position.y = 0.69; cap.rotation.y = Math.PI / 4; post.add(cap);
      const pl = new THREE.PointLight(FENCE_HEX, 0, 3, 2); pl.position.y = 0.6; post.add(pl);
      const fpM = gmat(FENCE_HEX); fpM.transparent = true; fpM.opacity = 0; fpM.depthWrite = false; fpM.userData.glow = false;
      const fpool = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), fpM); fpool.rotation.x = -Math.PI / 2; fpool.position.y = 0.02; post.add(fpool);
      lamps.push({ bulb, offM, onM, pl, fpM, lit: false });
    }
    const inner = new THREE.PointLight(lampHex, 0, 1.2, 1.5); inner.position.set(0, win.h * 0.7, -0.22); room.add(inner);
    Object.assign(parts, { sillLamp, backLitM, inner, pane, paneM, light, pool, poolM, keeps, lamps, win, room, wallZ: d / 2 + 0.03 });
    refresh(true);
    return root;
  }

  function refresh(instant) {
    if (!root) return;
    const n = keepsakeCount();
    if (pendingIdx >= 0 && (!st.deliveredTonight || pendingIdx >= n)) pendingIdx = -1;
    parts.keeps.forEach((k, i) => { const vis = (n >= KEEPSAKES.length ? true : i < n) && i !== pendingIdx; if (vis && !k.visible && !instant && !(drop && drop.k === k)) popT = 1; k.visible = vis; });
    if (drop && !drop.k.visible) endDrop();
    if (parts.sillLamp) parts.sillLamp.visible = n > 0;
    parts.lamps.forEach((l, i) => { const on = i < st.finished; l.lit = on; l.bulb.material = on ? l.onM : l.offM; l.pl.intensity = on ? 0.8 : 0; l.fpM.opacity = on ? 0.16 : 0; });
  }

  function onDelivered() {
    if (st.deliveredTonight) return null;
    st.deliveredTonight = true; lampOn = true; save();
    const ni = keepsakeCount() - 1; if (ni < KEEPSAKES.length) pendingIdx = ni; // hold it back for the push-in drop
    refresh(false);
    const k = KEEPSAKES[(st.night - 1) % KEEPSAKES.length];
    const info = { night: st.night, keepsake: k }; emit('lamp', info); return info;
  }
  // only after onDelivered(); returns false otherwise (keeps lamps/keepsakes, lights one more fence lamp)
  function advanceNight() {
    if (!st.deliveredTonight) return false;
    syncDeliveries();
    st.finished++; st.night++; st.deliveredTonight = false; lampOn = false; lampT = 0; save(); refresh(true); placeDoorsteps();
    emit('night', { night: st.night }); return true;
  }
  function endDrop() { if (!drop) return; drop.k.position.y = drop.y0; drop.k.position.z = drop.z0; drop = null; }
  // call when the end-of-night camera push toward her windowsill begins: tonight's keepsake drops onto the sill
  function onPushStart() {
    if (!root || pendingIdx < 0) return false;
    const k = parts.keeps[pendingIdx]; pendingIdx = -1; endDrop();
    drop = { k, t: 0, y0: k.position.y, z0: k.position.z, h: parts.win.h * 0.9, zw: parts.wallZ };
    k.position.y = drop.y0 + drop.h; k.position.z = drop.zw; k.visible = true; return true;
  }
  function reset() { clearDoorsteps(); st.deliveries = []; seen = 0; st.night = 1; st.finished = 0; st.deliveredTonight = false; lampOn = false; lampT = 0; save(); refresh(true); }

  let t = 0;
  function update(dt) {
    if (!root) return; t += dt; syncDeliveries(); if (st.night >= 2 && !doorDone) placeDoorsteps();
    lampT = THREE.MathUtils.clamp(lampT + (lampOn ? dt / 1.8 : -dt / 0.5), 0, 1);
    const e = lampT * lampT * (3 - 2 * lampT), flick = 1 + 0.04 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
    parts.paneM.opacity = 0.08 * e; parts.backLitM.opacity = e; parts.inner.intensity = 0.9 * e * flick; parts.light.intensity = 0.9 * e * flick; parts.poolM.opacity = 0.12 * e;
    if (drop) {
      drop.t += dt; const tt = drop.t, k = drop.k;
      if (tt < DROP_FALL) { const u = tt / DROP_FALL; k.position.y = drop.y0 + drop.h * (1 - u * u); k.position.z = drop.zw + (drop.z0 - drop.zw) * Math.min(1, u * 1.6); }
      else if (tt < DROP_END) { const v = (tt - DROP_FALL) / (DROP_END - DROP_FALL - 0.1); k.position.z = drop.z0; k.position.y = drop.y0 + (v < 1 ? drop.h * DROP_BOUNCE * Math.sin(Math.PI * v) : 0); }
      else endDrop();
    }
    if (popT > 0) { popT = Math.max(0, popT - dt * 1.4); }
    parts.keeps.forEach(k => { if (k.visible) k.scale.setScalar(k.userData.base * (1 + 0.6 * popT * Math.sin(popT * 9))); });
    parts.lamps.forEach((l, i) => { if (l.lit) l.pl.intensity = 0.8 * (1 + 0.08 * Math.sin(t * 3 + i)); });
  }

  // ---- doorstep keepsakes (night 2+) -------------------------------------------------------
  // Data source (no game.js edit needed): game.js pushes houses.indexOf(h) into window.PaperEcho.deliveredThisNight
  // on every delivery (cleared after np.advanceNight()). We poll it in update()/advanceNight() while night === 1.
  // House index -> house Group: houses are the planet children carrying userData.win + userData.mats, in creation order
  // (same order as game.js's houses[]). houseId = window.houseIdOf(h) (person zh name or 'houseN'), as game.js uses it.
  // recipient = person zh name (the key copy/night2-clues.json uses; 老周 = zhouHouse). game.js's HOF(name) is module-local,
  // so it is used only if ever exposed as window.HOF. Door: house-local box 0.24x0.44 at (-w*0.25, 0.22, d/2+0.01); +Z = front.
  let anchorRef = null, seen = 0, doorDone = false, doorObjs = [], doorMap = null;
  const KEEP_FOR = Object.fromEntries(KEEPSAKES.map(k => [k.from, k]));
  function houseList() {
    const planet = anchorRef && anchorRef.parent; if (!planet) return [];
    return planet.children.filter(o => o.userData && o.userData.win && Array.isArray(o.userData.mats));
  }
  function idOf(h, i) { try { if (typeof window !== 'undefined' && window.houseIdOf) return window.houseIdOf(h); } catch {} return h && h.userData.person ? h.userData.person.name.zh : 'house' + i; }
  function syncDeliveries() {
    let arr; try { arr = window.PaperEcho && window.PaperEcho.deliveredThisNight; } catch {}
    if (!Array.isArray(arr)) return;
    if (arr.length < seen) seen = 0; // game cleared the list (new night)
    if (st.night !== 1) { seen = arr.length; return; }
    if (arr.length === seen) return;
    const hs = houseList();
    for (let j = seen; j < arr.length; j++) {
      const idx = arr[j], h = hs[idx]; if (!h) continue;
      const houseId = idOf(h, idx);
      if (st.deliveries.some(d => d.night === 1 && d.houseIndex === idx)) continue;
      const recipient = h.userData.person && h.userData.person.name ? h.userData.person.name.zh : null;
      const k = KEEP_FOR[recipient] || KEEP_FOR[houseId] || KEEPSAKES[(st.night - 1) % KEEPSAKES.length];
      st.deliveries.push({ night: 1, houseId, recipient, houseIndex: idx, keepsake: k.id, name: KEEPSAKE_ZH[k.id] || k.id });
    }
    seen = arr.length; save();
  }
  function doorFor(d, hs) {
    if (doorMap && (doorMap[d.recipient] || doorMap[d.houseId])) return doorMap[d.recipient] || doorMap[d.houseId];
    let h = null; try { if (d.recipient && typeof window !== 'undefined' && typeof window.HOF === 'function') h = window.HOF(d.recipient) || null; } catch {}
    if (!h) { h = hs[d.houseIndex]; if (!h || idOf(h, d.houseIndex) !== d.houseId) h = hs.find((x, i) => idOf(x, i) === d.houseId); }
    if (!h) return null;
    let door = null; h.children.forEach(c => { const p = c.isMesh && c.geometry && c.geometry.parameters; if (p && Math.abs(p.width - 0.24) < 1e-3 && Math.abs(p.height - 0.44) < 1e-3) door = c; });
    const u = h.userData, x = door ? door.position.x : -(u.w || 1.2) * 0.25, z = door ? door.position.z : (u.d || 1) / 2;
    // fence (game.js house()): 6 posts BoxGeometry(0.04,0.22,0.04) + rail BoxGeometry(w,0.03,0.03), all at z = d/2+0.4, no gate.
    // With a fence: put it just OUTSIDE the fence line on the walk-up path (fence z + 0.28) so the fence never hides it.
    // Without: the same path spot (d/2 + 0.68), so every house reads the same way from the road.
    let fz = null; h.children.forEach(c => { const p = c.isMesh && c.geometry && c.geometry.parameters; if (p && Math.abs(p.width - 0.04) < 1e-3 && Math.abs(p.height - 0.22) < 1e-3 && Math.abs(p.depth - 0.04) < 1e-3 && c.position.z > z) fz = Math.max(fz ?? -1e9, c.position.z); });
    const pz = fz != null ? fz + 0.28 : (u.d || 1) / 2 + 0.68;
    return { parent: h, pos: new THREE.Vector3(x, 0, pz), fence: fz != null };
  }
  function clearDoorsteps() { doorObjs.forEach(o => o.parent && o.parent.remove(o)); doorObjs = []; doorDone = false; }
  const DOOR_SCALE = 2.6;
  function placeDoorsteps() {
    if (!root || st.night < 2 || doorDone) return 0;
    clearDoorsteps(); const hs = houseList(); let n = 0;
    for (const d of st.deliveries) {
      if (d.night !== 1) continue; const at = doorFor(d, hs); if (!at) continue;
      const m = buildKeepsake(d.keepsake, mat); m.name = 'doorstepKeepsake'; m.userData.doorstep = d.recipient || d.houseId; m.userData.noOcclude = false; m.userData.outsideFence = !!at.fence;
      m.position.copy(at.pos); if (d.keepsake === 'star') m.position.y -= 0.2 * DOOR_SCALE; // star mesh hangs high; rest it on the ground
      m.scale.setScalar(DOOR_SCALE); // house-local, +Z = outward; no collider (game.js obstacles[] untouched)
      m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.noOcclude = false; } });
      at.parent.add(m); doorObjs.push(m); n++;
    }
    doorDone = true; return n;
  }
  // accepts a recipient name (e.g. '老周'), a game.js houseId, or a house index
  function keepsakeFor(key) { const d = st.deliveries.find(x => x.recipient === key || x.houseId === key || x.houseIndex === key); return d ? d.name : null; }
  // fallback setter: { recipientOrHouseId: { parent: Object3D, pos: Vector3 (parent-local) } }; re-places doorsteps
  function setDoorPositions(map) { doorMap = map || null; if (doorDone) { doorDone = false; placeDoorsteps(); } return true; }

  const api = {
    attach, update, onDelivered, advanceNight, reset, onPushStart, keepsakeFor, setDoorPositions, placeDoorsteps,
    get deliveries() { syncDeliveries(); return st.deliveries.map(d => ({ ...d })); },
    get doorsteps() { return doorObjs; },
    on: (e, f) => ((listeners[e] ||= []).push(f), () => listeners[e].splice(listeners[e].indexOf(f), 1)),
    get state() { return { dropPending: pendingIdx >= 0, dropping: !!drop, night: st.night, finished: st.finished, deliveredTonight: st.deliveredTonight, keepsakes: keepsakeCount(), lampLevel: lampT }; },
    get root() { return root; },
  };
  try { if (typeof window !== 'undefined') window.nightProgress = api; } catch {} // debug/capture handle (game.js keeps its own np)
  return api;
}
