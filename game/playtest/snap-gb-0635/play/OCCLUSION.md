# occlusion.js v4.3 — circular see-through cutout around the postman (àṣẹ)

**v4.3:** a hole is cut only when the ray to the HEAD (1.05) is blocked; chest/leg rays are reported in `__occ.rays()` but never cut. Circle centre back at 0.6. `?occdebug` adds per-hit details to `__occ.rays().hits`. Backup of v4.2: /tmp/occlusion.v42.js.

**v4.1:** INNER 0.75 (thinner ring), kept ring pixels tinted 40% toward grass #3f6b4a (fades to 0 at the rim) so dots don't stack into a dark crescent; KEEP stays 0.3. `userData.noOcclude === true` on an object or any ancestor removes it from occluder rays and masking (e.g. the light pillar).

**v4 changes:** inner 60% of the radius fully cut (no dither) with a faint 1px #373f42 50% silhouette line kept; dither only in the outer 40% ring (coverage KEEP 0.3 → 1); hole only when a ray to the chest (0.6) or head (1.05) is blocked — legs/feet alone never cut. v3 backup: /tmp/occlusion.v3.js.

## What it does
When a tree, house, rock or pole stands **between the camera and the postman**, a soft circle
around him becomes see-through on that object only. Everything else stays solid; the postman
is never touched.

## How it works
1. **Who is an occluder.** Each frame a ray goes from the camera to the postman's **chest**
   (origin + 0.6 along his local up; the planet is round). A mesh counts only if it is hit at
   least `FRONT_PAD` nearer than the postman. The hit mesh resolves to its placed root (whole
   tree / house), and the whole root gets the mask. Things **behind** him (the recipient's house
   during the delivery push-in, `playtest/v4-f120.png`) are never hit, so they stay solid. That
   was the v1 bug: v1 aimed 1 unit above his head and faded whole objects.
2. **The mask.** Screen-space circle: centre = projected chest, radius = `RADIUS_K` (1.5) x his
   on-screen height (projected feet→head), outer `SOFT` (20%) ramps back to solid.
3. **Dither, not alpha.** Inside the circle, occluder pixels are `discard`ed with a 4x4 Bayer
   pattern in 2 px cells, keeping `KEEP` (58%, v3) of them solid at the centre. No
   blending, so ids and depth stay clean.
4. **Outlines follow the same mask.** This game writes colour, surface id (`color.a`) and
   depth/normal/contribution (`gInfo`) in **one MRT draw**; the outline is a post pass over those
   textures. The discard runs at the top of the same shader, so masked pixels write nothing to
   any G-buffer, and the outline is cut exactly by the circle. There's no separate outline pass to
   patch. (Shadow-map depth is untouched on purpose, so faded trees still cast shadows.)
5. **No "dirty patch".** v1's dots each got an outline ring (tree id vs ground id), which looked
   like a dirt patch on the grass. v2/v3 multiply `gInfo.a` (outline contribution) by
   `1 - mask` for surviving occluder pixels, **the ground and instanced grass tufts**, so outlines are
   simply dropped inside the circle instead of being dithered, but only inside the circle and
   only while something is occluding. The postman isn't patched, so his outline stays.
6. **Material safety.** Occluder materials are cloned (the original `onBeforeCompile` runs first,
   then the mask is injected), shared materials on other objects stay untouched, and live uniforms
   (`userData.u`) plus palette colours are carried over. Originals come back when the fade
   finishes (~0.2 s). The ground and grass get one permanent clone each with mask strength `uOccAny` (0 when
   nothing occludes).
7. **Player exclusion.** Anything inside the `player` subtree or under `userData.noOcclude` is
   skipped by both scan and patch. `window.__occ.playerPatched()` returns 0 (debug check).

## Opting out
Set `obj.userData.noOcclude = true` on any object (or a parent group): it is never a ray hit and never masked. The player subtree is always excluded. Example: `pillar.userData.noOcclude = true;`

## API
```js
updateOcclusion(camera, player, scene, bufferSize?)  // bufferSize {x,y} in drawing-buffer px; default = first <canvas> size
window.__occ.faded()          // [{name, v}] objects currently masked
window.__occ.playerPatched()  // must be 0
```

## Integration (2 lines; game.js already has the equivalent)
```js
import { updateOcclusion } from './occlusion.js';
updateOcclusion(camera, hero, scene);   // every frame, after the camera update, before render()
```

## Tunables (top of occlusion.js)
| name | default | meaning |
|---|---|---|
| RADIUS_K | 1.5 | circle radius / postman's on-screen height |
| INNER | 0.75 | inner fraction of the radius fully cut (no dither) (v4: 0.60) |
| GRASS_HEX / RING_TINT | #3f6b4a / 0.4 | ring dots tinted toward grass by RING_TINT x ring strength |
| KEEP | 0.30 | coverage at the inner edge of the dither ring; ramps to 1 at the rim |
| LINE_HEX / LINE_ALPHA | #373f42 / 0.5 | silhouette line kept inside the cut (1px; 50% = 1px checkerboard, no blending) |
| DOT_PX | 2 | Bayer cell size in px |
| HEAD | 1.05 | v4.3: the only ray that cuts a hole (legs/chest blocked alone → no hole) |
| CENTER | 0.6 | circle centre height (same visual centre as v4.1) |
| CHEST | 0.8 | debug-only ray (`?occdebug` / `__occ.rays()`), never cuts |
| FRONT_PAD | 0.6 | how much nearer than the postman an occluder must be |
| IN_RATE / OUT_RATE | 9 / 4.5 | fade in/out speed (1/s) |
Debug: `window.__occ.rays()` → `{chest, head, legs}` hit counts (legs is informational only).

## Verify
`python3 occlusion-v4-shots.py` → `occlusion-shots/v4-{feet,upper}-{before,after}.png` (before = v3 via routing; auto-searches a feet-only and an upper-body tree case).
`python3 occlusion-shots.py [tree] [delivery]` → `occlusion-shots/{tree,delivery}-{before,after}.png`.
Before = v1 (served by request routing), after = this file. Real game, headless Chrome + SwiftShader.
