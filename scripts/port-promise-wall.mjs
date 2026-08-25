#!/usr/bin/env node
/**
 * One-shot porter: lift Promise Wall's center-wall engine out of
 * /tmp/promise-wall/index.html and wrap it as an ES module.
 */
import fs from "node:fs";

const html = fs.readFileSync("/tmp/promise-wall/index.html", "utf8");
const open = html.indexOf("      (function () {");
const close = html.lastIndexOf("      })();");
if (open < 0 || close < 0) throw new Error("could not find Promise Wall IIFE");

let body = html.slice(open + "      (function () {\n".length, close);

body = body.replace(/ {8}"use strict";\n {8}if \(!window\.THREE[\s\S]*?return;\n {8}\}\n/, "");

const header = `// @ts-nocheck
/**
 * Promise Wall — center wall engine (direct port).
 *
 * Source: https://github.com/thebuggeddev/promise-wall
 *         index.html @ 0cb1b20c3952e4c4184b7e0e33fe5acfac2b4447
 * Live:   https://promise-wall-ashen.vercel.app/
 *
 * Upstream ships as one HTML file (Three.js r128 + GSAP 3.12.5). This module
 * keeps their wall: procedural paper/plaster/wood, card factory, pin/tape/clip,
 * hover lift, sway, drag-pan, select dim, pin-in timeline, and the rAF loop.
 * Paper Echo only swaps the note text and omits their sidebar / search / dock /
 * compose chrome. The upstream repo does not publish a license file; keep this
 * attribution with the ported wall.
 */
import * as THREE from "three";
import { gsap } from "gsap";

export function mountPromiseWall(canvas, options = {}) {
        const host = options.host || canvas.parentElement || canvas;
        const onSelect = options.onSelect || (() => {});
        const onVacant = options.onVacant || (() => {});
        const selectedId = options.selectedId || null;
        const pinFreshId = options.pinFreshId || null;
        let live = true;
        let raf = 0;
        const listeners = [];
        const onWin = (type, fn, opts) => {
          addEventListener(type, fn, opts);
          listeners.push(() => removeEventListener(type, fn, opts));
        };
        const onEl = (el, type, fn, opts) => {
          el.addEventListener(type, fn, opts);
          listeners.push(() => el.removeEventListener(type, fn, opts));
        };
        const view = () => {
          const r = host.getBoundingClientRect();
          return {
            w: Math.max(1, r.width || host.clientWidth || canvas.clientWidth || 1),
            h: Math.max(1, r.height || host.clientHeight || canvas.clientHeight || 1),
            left: r.left,
            top: r.top,
          };
        };
`;

// size helpers: their fullscreen globals become the host box
body = body.replace(/\binnerWidth\b/g, "view().w");
body = body.replace(/\binnerHeight\b/g, "view().h");

// pointer NDC must be relative to the canvas box, not the window
body = body.replace(
  `        function setNDC(e) {
          ndc.x = (e.clientX / view().w) * 2 - 1;
          ndc.y = -(e.clientY / view().h) * 2 + 1;
        }
        function wallPointAt(cx, cy) {
          ndc.x = (cx / view().w) * 2 - 1;
          ndc.y = -(cy / view().h) * 2 + 1;`,
  `        function setNDC(e) {
          const v = view();
          ndc.x = ((e.clientX - v.left) / v.w) * 2 - 1;
          ndc.y = -((e.clientY - v.top) / v.h) * 2 + 1;
        }
        function wallPointAt(cx, cy) {
          const box = view();
          ndc.x = ((cx - box.left) / box.w) * 2 - 1;
          ndc.y = -((cy - box.top) / box.h) * 2 + 1;`,
);

// CJK wrap: their wrapText splits on spaces; Chinese letters have none
body = body.replace(
  `        function wrapText(ctx, text, maxW) {
          const words = text.split(" "),
            lines = [];
          let cur = "";
          for (const w of words) {
            const t = cur ? cur + " " + w : w;
            if (ctx.measureText(t).width > maxW && cur) {
              lines.push(cur);
              cur = w;
            } else cur = t;
          }
          if (cur) lines.push(cur);
          return lines;
        }`,
  `        function wrapText(ctx, text, maxW) {
          const lines = [];
          let cur = "";
          const push = (ch, glue) => {
            const t = cur ? cur + glue + ch : ch;
            if (ctx.measureText(t).width > maxW && cur) {
              lines.push(cur);
              cur = ch;
            } else cur = t;
          };
          if (/\\s/.test(text)) {
            for (const w of text.split(" ")) push(w, " ");
          } else {
            for (const ch of text) push(ch, "");
          }
          if (cur) lines.push(cur);
          return lines;
        }`,
);

// handwritten Chinese needs a CJK face; Latin keeps their Caveat / Garamond
body = body.replace(
  `          const serif = p.font === "serif";
          let size = serif ? 56 : 52;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          let lines;
          for (;;) {
            ctx.font = serif
              ? \`600 \${size}px 'Cormorant Garamond'\`
              : \`600 \${size}px Caveat\`;`,
  `          const serif = p.font === "serif";
          const cjk = /[\\u3400-\\u9fff]/.test(p.text || "");
          let size = serif ? 56 : 52;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          let lines;
          for (;;) {
            ctx.font = serif
              ? cjk
                ? \`600 \${size}px 'Noto Sans SC'\`
                : \`600 \${size}px 'Cormorant Garamond'\`
              : cjk
                ? \`400 \${size}px 'Ma Shan Zheng'\`
                : \`600 \${size}px Caveat\`;`,
);

// scene canvas + size
body = body.replace(
  `        const canvas = document.getElementById("scene");
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(view().w, view().h);`,
  `        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(view().w, view().h, false);`,
);

// inject our notes as store.promises (same P() shape)
body = body.replace(
  `        const store = {
          promises: [`,
  `        const incoming = Array.isArray(options.notes) ? options.notes : [];
        const store = {
          promises: incoming.length
            ? incoming.map((n) => P(n))
            : [`,
);

// close the fallback sample array — original ends with `          ],\n        };`
// After our ternary, we need `: [ ...original... ];` then `        };`
// The original already has `          ],` then `        };` — add a closing paren
body = body.replace(
  `          ],
        };

        const TEMPLATES = [`,
  `          ],
        };

        const TEMPLATES = [`,
);

// If incoming notes exist we used them; if not, keep their sample as empty-wall
// filler? User said feed OUR data only. Empty incoming → empty wall, no sample.
// Re-do: never ship their sample promises as content.
body = body.replace(
  `        const incoming = Array.isArray(options.notes) ? options.notes : [];
        const store = {
          promises: incoming.length
            ? incoming.map((n) => P(n))
            : [`,
  `        const incoming = Array.isArray(options.notes) ? options.notes : [];
        const _upstreamSample = [`,
);

body = body.replace(
  `          ],
        };

        const TEMPLATES = [`,
  `          ];
        void _upstreamSample;
        const store = {
          promises: incoming.map((n) => P(n)),
        };

        const TEMPLATES = [`,
);

// chrome-safe el()
body = body.replace(
  `        const panel = document.getElementById("panel");
        const el = (id) => document.getElementById(id);`,
  `        const stub = () => {
          const s = {
            textContent: "",
            value: "",
            innerHTML: "",
            style: {},
            classList: {
              add() {},
              remove() {},
              toggle() {},
              contains() {
                return false;
              },
            },
            querySelector() {
              return s;
            },
            querySelectorAll() {
              return [];
            },
            addEventListener() {},
            focus() {},
            appendChild() {},
          };
          return s;
        };
        const panel = document.getElementById("panel") || stub();
        const el = (id) => document.getElementById(id) || stub();`,
);

// selectCard should notify Paper Echo (journey / memory is on p)
body = body.replace(
  `          panel.classList.add("open");
        }`,
  `          panel.classList.add("open");
          onSelect(p);
        }`,
);

body = body.replace(
  `          gsap.to(cam, {
            tz: 30,
            duration: REDUCED ? 0 : 0.9,
            ease: "power3.inOut",
          });
        }`,
  `          gsap.to(cam, {
            tz: 30,
            duration: REDUCED ? 0 : 0.9,
            ease: "power3.inOut",
          });
          onVacant();
        }`,
);

// pointer listeners on canvas; window pointerup/keydown/resize tracked
body = body.replace(
  `        canvas.addEventListener("pointermove", (e) => {`,
  `        onEl(canvas, "pointermove", (e) => {`,
);
body = body.replace(
  `        canvas.addEventListener("pointerdown", (e) => {`,
  `        onEl(canvas, "pointerdown", (e) => {`,
);
body = body.replace(
  `        addEventListener("pointerup", (e) => {`,
  `        onWin("pointerup", (e) => {`,
);
body = body.replace(
  `        canvas.addEventListener(
          "wheel",`,
  `        onEl(
          canvas,
          "wheel",`,
);
body = body.replace(
  `        addEventListener("keydown", (e) => {`,
  `        onWin("keydown", (e) => {`,
);
body = body.replace(
  `        addEventListener("resize", () => {
          camera.aspect = view().w / view().h;
          camera.updateProjectionMatrix();
          renderer.setSize(view().w, view().h);
        });`,
  `        const fit = () => {
          if (!live) return;
          camera.aspect = view().w / view().h;
          camera.updateProjectionMatrix();
          renderer.setSize(view().w, view().h, false);
        };
        onWin("resize", fit);
        const ro = new ResizeObserver(fit);`,
);

// skip projected chrome in the loop
body = body.replace(
  `          // projected UI
          project(addAnchor, addBtnEl, 0, 0);
          project(hintAnchor, addHintEl, 0, 0);
          renderer.render(scene, camera);
        }`,
  `          if (live) renderer.render(scene, camera);
        }`,
);

body = body.replace(
  `        function loop(now) {
          requestAnimationFrame(loop);`,
  `        function loop(now) {
          if (!live) return;
          raf = requestAnimationFrame(loop);`,
);

// boot: our notes, optional pin-in, optional select — no loader / no hero panel
body = body.replace(
  `        const fontWait = Promise.race([
          Promise.all([
            document.fonts.load("600 40px Caveat"),
            document.fonts.load("600 40px 'Cormorant Garamond'"),
            document.fonts.ready,
          ]),
          new Promise((r) => setTimeout(r, 2600)),
        ]);
        fontWait.then(() => {
          store.promises.forEach(buildCard);
          renderRecent();
          requestAnimationFrame(loop);
          setTimeout(() => {
            document.getElementById("loader").classList.add("done");
            // open the hero promise, as in the reference — without stealing the camera
            const hero = cards.find((c) =>
              c.userData.p.text.startsWith("I will keep showing up"),
            );
            if (hero && view().w > 960)
              selectCard(hero, { moveCamera: false });
          }, 400);
        });
`,
  `        const fontWait = Promise.race([
          Promise.all([
            document.fonts.load("600 40px Caveat"),
            document.fonts.load("600 40px 'Cormorant Garamond'"),
            document.fonts.load("400 40px 'Ma Shan Zheng'"),
            document.fonts.load("600 40px 'Noto Sans SC'"),
            document.fonts.ready,
          ]),
          new Promise((r) => setTimeout(r, 2600)),
        ]);
        function pinIn(g) {
          const p = g.userData.p;
          const baseZ = g.userData.baseZ;
          const finalRot = g.userData.baseRot;
          const pinHead = g.userData.pinHead;
          const pinZ0 = pinHead ? pinHead.position.z : 0;
          g.position.set(p.x, p.y + 1.8, 1.6);
          if (pinHead) {
            pinHead.position.z = 2.2;
            pinHead.material.transparent = true;
            pinHead.material.opacity = 0;
          }
          if (REDUCED) {
            g.position.set(p.x, p.y, baseZ);
            g.rotation.set(0, 0, finalRot);
            if (pinHead) {
              pinHead.position.z = pinZ0;
              pinHead.material.opacity = 1;
            }
            return;
          }
          const tl = gsap.timeline();
          tl.to(g.position, { x: p.x, y: p.y, duration: 0.32, ease: "power2.out" }, 0)
            .to(
              g.position,
              {
                z: baseZ,
                duration: 0.42,
                ease: "power3.in",
                onComplete: () => tap(150, 0.09, 0.1),
              },
              0,
            )
            .to(g.rotation, { x: 0, y: 0, z: finalRot, duration: 0.45, ease: "power2.out" }, 0)
            .to(g.scale, { y: 0.965, duration: 0.09, ease: "power2.in" }, 0.42)
            .to(g.scale, { y: 1, duration: 0.6, ease: "elastic.out(1,.4)" }, 0.51);
          if (pinHead) {
            tl.to(pinHead.material, { opacity: 1, duration: 0.12 }, 0.35)
              .to(
                pinHead.position,
                {
                  z: pinZ0,
                  duration: 0.3,
                  ease: "back.in(1.6)",
                  onComplete: () => tap(1900, 0.05, 0.09),
                },
                0.4,
              )
              .fromTo(
                pinHead.scale,
                { z: 0.5 },
                { z: 0.75, duration: 0.4, ease: "elastic.out(1,.45)" },
                0.7,
              );
          }
        }
        fontWait.then(() => {
          if (!live) return;
          fit();
          ro.observe(host);
          store.promises.forEach(buildCard);
          raf = requestAnimationFrame(loop);
          canvas.dataset.wallReady = "1";
          canvas.dataset.cardCount = String(cards.length);
          const fresh = pinFreshId
            ? cards.find((c) => c.userData.p.id === pinFreshId)
            : null;
          if (fresh) pinIn(fresh);
          const pick = selectedId
            ? cards.find((c) => c.userData.p.id === selectedId)
            : null;
          if (pick) selectCard(pick, { moveCamera: !fresh });
        });

        function destroy() {
          live = false;
          cancelAnimationFrame(raf);
          try {
            ro.disconnect();
          } catch (e) {}
          listeners.forEach((off) => off());
          gsap.killTweensOf(cam);
          cards.forEach((g) => {
            gsap.killTweensOf(g.position);
            gsap.killTweensOf(g.rotation);
            gsap.killTweensOf(g.scale);
            gsap.killTweensOf(g.userData.dim);
            g.traverse((o) => {
              if (o.geometry) o.geometry.dispose();
              if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach((m) => {
                  if (m.map) m.map.dispose();
                  m.dispose();
                });
              }
            });
            scene.remove(g);
          });
          renderer.dispose();
          delete canvas.dataset.wallReady;
        }

        function selectById(id, opts) {
          const g = cards.find((c) => c.userData.p.id === id);
          if (g) selectCard(g, opts);
          else if (selected) closePanel();
        }

        return { destroy, selectById, closePanel, cards };
`,
);

const out = header + body + "\n}\n";
const dest = new URL("../src/game/vendor/promise-wall.js", import.meta.url);
fs.mkdirSync(new URL(".", dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log("wrote", dest.pathname, "bytes", out.length);
