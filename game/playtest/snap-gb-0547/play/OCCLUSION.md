# occlusion.js v2 — circular see-through cutout around the postman (àṣẹ)

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
| SOFT | 0.20 | soft edge, fraction of the radius |
| KEEP | 0.58 | pixel coverage kept at the centre (v3, was 0.30: lighter, cleaner) |
| DOT_PX | 2 | Bayer cell size in px |
| CHEST | 0.6 | ray target / circle centre height |
| FRONT_PAD | 0.6 | how much nearer than the postman an occluder must be |
| IN_RATE / OUT_RATE | 9 / 4.5 | fade in/out speed (1/s) |

## Verify
`python3 occlusion-shots.py [tree] [delivery]` → `occlusion-shots/{tree,delivery}-{before,after}.png`.
Before = v1 (served by request routing), after = this file. Real game, headless Chrome + SwiftShader.
