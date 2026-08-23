// @ts-nocheck
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
        const REDUCED =
          options.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
        const rnd = (a, b) => a + Math.random() * (b - a);
        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

        /* ------------------------------------------------------------
   1. DATA
------------------------------------------------------------ */
        const CATEGORIES = [
          "Health",
          "Kindness",
          "Learning",
          "Family",
          "Work",
          "Self-Growth",
          "Relationships",
          "Creativity",
        ];

        const PAPERS = {
          classic: {
            label: "Classic",
            base: "#f4eddc",
            ink: "#4a4234",
            torn: true,
            lines: "none",
            grain: 0.1,
            swatch: "background:#f4eddc",
          },
          notebook: {
            label: "Notebook",
            base: "#f7f3e8",
            ink: "#44507a",
            torn: false,
            lines: "ruled",
            spiral: true,
            grain: 0.06,
            swatch:
              "background:repeating-linear-gradient(#f7f3e8,#f7f3e8 9px,#cdd6e6 9px,#cdd6e6 10px)",
          },
          graph: {
            label: "Graph",
            base: "#f6f4ec",
            ink: "#3f4a41",
            torn: false,
            lines: "grid",
            grain: 0.05,
            swatch:
              "background:#f6f4ec;background-image:linear-gradient(#dfe4d8 1px,transparent 1px),linear-gradient(90deg,#dfe4d8 1px,transparent 1px);background-size:9px 9px",
          },
          pastelPink: {
            label: "Blush",
            base: "#ecd3cd",
            ink: "#5c4038",
            torn: true,
            lines: "none",
            grain: 0.09,
            swatch: "background:#ecd3cd",
          },
          pastelPurple: {
            label: "Lilac",
            base: "#cfc6e0",
            ink: "#453d5c",
            torn: false,
            lines: "none",
            grain: 0.08,
            swatch: "background:#cfc6e0",
          },
          pastelGreen: {
            label: "Sage",
            base: "#cfd3bd",
            ink: "#3f4632",
            torn: false,
            lines: "none",
            grain: 0.09,
            swatch: "background:#cfd3bd",
          },
          kraft: {
            label: "Kraft",
            base: "#c9a878",
            ink: "#46351f",
            torn: true,
            lines: "none",
            grain: 0.16,
            swatch: "background:#c9a878",
          },
          torn: {
            label: "Handmade",
            base: "#efe9dd",
            ink: "#443d31",
            torn: true,
            lines: "none",
            grain: 0.13,
            rough: true,
            swatch:
              "background:#efe9dd;box-shadow:inset 0 0 0 3px #fff, 0 2px 6px rgba(80,60,35,.18)",
          },
        };

        let uid = 0;
        const P = (o) =>
          Object.assign(
            {
              id: "p" + ++uid,
              type: "note",
              author: "Jess",
              category: "Self-Growth",
              paper: "classic",
              attach: "pin",
              pinColor: 0x9a7b3f,
              rot: rnd(-3, 3),
              w: 4.2,
              font: "hand",
              doodle: "none",
              support: rnd(20, 160) | 0,
              reflect: rnd(5, 80) | 0,
              saves: rnd(4, 60) | 0,
              date: "Apr 24, 2024",
              ago: "2d ago",
              tags: [],
              body: "A small promise, kept daily, quietly becomes a life.",
            },
            o,
          );

        const incoming = Array.isArray(options.notes) ? options.notes : [];
        const _upstreamSample = [
            P({
              type: "photo",
              photo: "mountain",
              x: -17.6,
              y: 8.3,
              w: 4.8,
              rot: -2.5,
              author: "Noah",
              category: "Health",
              text: "Where I go to breathe.",
              date: "Apr 20, 2024",
              body: "A photograph from the ridge trail. I promised myself I would come back every season.",
            }),
            P({
              text: "Be present in the moments that matter most.",
              x: -7.6,
              y: 8.7,
              w: 5.3,
              paper: "torn",
              font: "serif",
              doodle: "heart",
              rot: -1,
              author: "Amara",
              category: "Family",
              support: 118,
              reflect: 41,
              saves: 37,
              body: "Phones down at dinner. Eyes up when someone is talking. That is the whole promise.",
            }),
            P({
              text: "Make time for what makes my soul happy.",
              x: -0.7,
              y: 8.6,
              w: 4.2,
              paper: "pastelPink",
              attach: "tape",
              rot: 1.5,
              author: "Priya",
              category: "Self-Growth",
              doodle: "heart",
              body: "One hour a week that belongs only to me — no errands allowed.",
            }),
            P({
              text: "Drink water. Move my body. Clear my mind.",
              x: 5.9,
              y: 9.1,
              w: 4.5,
              paper: "kraft",
              rot: 2,
              author: "Leo",
              category: "Health",
              doodle: "none",
              pinColor: 0x8a6a33,
              body: "Three small things, every single morning, before the world gets loud.",
            }),
            P({
              text: "Learn something new every week.",
              x: 11.6,
              y: 5.5,
              w: 3.9,
              paper: "pastelPurple",
              rot: -1.5,
              author: "Dev",
              category: "Learning",
              doodle: "sprig",
              body: "It does not have to be useful. It only has to be new.",
            }),
            P({
              text: "Call my family more often.",
              x: 16.9,
              y: 7.0,
              w: 4.0,
              attach: "tape",
              rot: 1,
              author: "Sana",
              category: "Family",
              doodle: "sprig",
              body: "Sunday evenings. Even for five minutes. Especially for five minutes.",
            }),
            P({
              text: "I will choose kindness, every day.",
              x: -15.6,
              y: 3.3,
              w: 4.3,
              paper: "pastelPink",
              rot: -2,
              author: "Maya",
              category: "Kindness",
              doodle: "heart",
              support: 203,
              reflect: 64,
              body: "Starting with the version of it that no one sees.",
            }),
            P({
              text: "I promise to believe in myself a little more each day.",
              x: -8.5,
              y: 2.1,
              w: 5.1,
              paper: "notebook",
              rot: -0.5,
              author: "Tom",
              category: "Self-Growth",
              doodle: "heart",
              body: "Not all at once. Just a little more than yesterday.",
            }),
            P({
              text: "I will keep showing up for my dreams.",
              x: -1.1,
              y: 2.4,
              w: 5.7,
              paper: "torn",
              font: "serif",
              doodle: "star",
              rot: 0.5,
              author: "Jess",
              category: "Self-Growth",
              support: 142,
              reflect: 89,
              saves: 76,
              date: "Apr 24, 2024",
              tags: ["growth", "discipline", "future"],
              body: "I may not see the results today, but I trust that consistency will create the life I imagine.",
            }),
            P({
              text: "Read more books.",
              x: -16.3,
              y: -3.7,
              w: 3.6,
              paper: "graph",
              attach: "clip",
              rot: -1,
              author: "Ravi",
              category: "Learning",
              doodle: "heart",
              body: "Twenty pages before the first scroll of the day.",
            }),
            P({
              text: "Be proud of how far I've come.",
              x: -9.9,
              y: -4.5,
              w: 3.9,
              paper: "kraft",
              rot: -2.5,
              author: "Ana",
              category: "Self-Growth",
              pinColor: 0x7d7d85,
              body: "The distance behind me counts too.",
            }),
            P({
              text: "Leave things better than I found them.",
              x: -4.3,
              y: -4.9,
              w: 3.8,
              paper: "pastelGreen",
              attach: "tape",
              rot: 1.5,
              author: "Omar",
              category: "Kindness",
              body: "Rooms, conversations, people.",
            }),
            P({
              text: "Take a deep breath and trust the process.",
              x: 4.7,
              y: -3.5,
              w: 4.3,
              paper: "torn",
              rot: 2,
              author: "Mia",
              category: "Health",
              doodle: "sprig",
              body: "Panic has never once finished a project for me. Breathing has.",
            }),
            P({
              text: "I choose progress over perfection.",
              x: 10.9,
              y: -1.8,
              w: 4.1,
              paper: "kraft",
              rot: -3,
              author: "Kai",
              category: "Work",
              support: 171,
              body: "Shipped and imperfect beats perfect and imaginary.",
            }),
            P({
              type: "photo",
              photo: "beach",
              x: 7.9,
              y: -7.7,
              w: 3.5,
              rot: 2.5,
              attach: "tape",
              author: "Mia",
              category: "Health",
              text: "Salt air resets me.",
              body: "Taken the morning I decided to slow down.",
            }),
            P({
              text: "Grateful for today.",
              x: 12.5,
              y: -7.2,
              w: 3.1,
              paper: "kraft",
              rot: 2,
              author: "Jon",
              category: "Kindness",
              doodle: "heart",
              body: "Even the ordinary ones. Especially the ordinary ones.",
            }),
            /* off to the sides — discovered by panning, and linked from "Recently added" */
            P({
              text: "I will protect my peace.",
              x: 21.5,
              y: 1.6,
              w: 4.0,
              rot: -1.5,
              author: "Zara",
              category: "Self-Growth",
              ago: "2m ago",
              body: "Not every argument deserves my entrance.",
            }),
            P({
              text: "Say thank you more often.",
              x: -21.8,
              y: 6.5,
              w: 3.9,
              paper: "pastelPurple",
              rot: 2,
              author: "Ben",
              category: "Kindness",
              doodle: "arrow",
              ago: "15m ago",
              body: "Out loud. In writing. In person.",
            }),
            P({
              text: "I will take care of my future self.",
              x: -21.9,
              y: -1.8,
              w: 4.1,
              paper: "pastelGreen",
              rot: -2,
              author: "Ines",
              category: "Health",
              ago: "20m ago",
              body: "She is counting on the choices I make tonight.",
            }),
            P({
              text: "Be a reason someone smiles today.",
              x: 21.8,
              y: -5.4,
              w: 4.0,
              paper: "pastelPink",
              attach: "tape",
              rot: 1,
              author: "Tayo",
              category: "Kindness",
              ago: "1h ago",
              body: "One person. Every day. That is enough.",
            }),
          ];
        void _upstreamSample;
        const store = {
          promises: incoming.map((n) => P(n)),
        };

        const TEMPLATES = [
          "I choose progress over perfection.",
          "I will keep showing up for my dreams.",
          "Make time for what makes my soul happy.",
          "I will speak to myself like someone I love.",
          "Take a deep breath and trust the process.",
          "Learn something new every week.",
        ];

        function wallStateJSON() {
          return JSON.stringify(store);
        } /* backend adapter hook */

        /* ------------------------------------------------------------
   2. PROCEDURAL TEXTURES (canvas → CanvasTexture)
------------------------------------------------------------ */
        function speckle(ctx, w, h, n, alpha, dark) {
          for (let i = 0; i < n; i++) {
            const a = Math.random() * alpha;
            ctx.fillStyle = dark
              ? `rgba(70,55,35,${a})`
              : `rgba(255,255,255,${a})`;
            ctx.fillRect(
              Math.random() * w,
              Math.random() * h,
              rnd(0.6, 2.2),
              rnd(0.6, 2.2),
            );
          }
        }
        function shade(hex, f) {
          // lighten/darken hex by factor
          const n = parseInt(hex.slice(1), 16),
            r = (n >> 16) & 255,
            g = (n >> 8) & 255,
            b = n & 255;
          const m = (v) => clamp(Math.round(v * f), 0, 255);
          return `rgb(${m(r)},${m(g)},${m(b)})`;
        }
        function tornPath(ctx, w, h, inset, rough) {
          const j = rough ? inset * 0.9 : inset * 0.5;
          const pts = [];
          const steps = 14;
          const edge = (x0, y0, x1, y1) => {
            for (let i = 0; i < steps; i++) {
              const t = i / steps;
              pts.push([
                x0 + (x1 - x0) * t + rnd(-j, j),
                y0 + (y1 - y0) * t + rnd(-j, j),
              ]);
            }
          };
          edge(inset, inset, w - inset, inset);
          edge(w - inset, inset, w - inset, h - inset);
          edge(w - inset, h - inset, inset, h - inset);
          edge(inset, h - inset, inset, inset);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (const p of pts) ctx.lineTo(p[0], p[1]);
          ctx.closePath();
        }
        function wrapText(ctx, text, maxW) {
          const lines = [];
          let cur = "";
          const push = (ch, glue) => {
            const t = cur ? cur + glue + ch : ch;
            if (ctx.measureText(t).width > maxW && cur) {
              lines.push(cur);
              cur = ch;
            } else cur = t;
          };
          if (/\s/.test(text)) {
            for (const w of text.split(" ")) push(w, " ");
          } else {
            for (const ch of text) push(ch, "");
          }
          if (cur) lines.push(cur);
          return lines;
        }
        function drawDoodle(ctx, kind, x, y, s, color) {
          ctx.save();
          ctx.translate(x, y);
          ctx.strokeStyle = color;
          ctx.lineWidth = s * 0.09;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.fillStyle = "none";
          if (kind === "heart") {
            ctx.beginPath();
            ctx.moveTo(0, s * 0.32);
            ctx.bezierCurveTo(
              -s * 0.55,
              -s * 0.15,
              -s * 0.22,
              -s * 0.5,
              0,
              -s * 0.12,
            );
            ctx.bezierCurveTo(
              s * 0.22,
              -s * 0.5,
              s * 0.55,
              -s * 0.15,
              0,
              s * 0.32,
            );
            ctx.stroke();
          } else if (kind === "star") {
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
              const r = i % 2 ? s * 0.2 : s * 0.45,
                a = -Math.PI / 2 + (i * Math.PI) / 5;
              const px = Math.cos(a) * r,
                py = Math.sin(a) * r;
              i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          } else if (kind === "sprig") {
            ctx.beginPath();
            ctx.moveTo(0, s * 0.5);
            ctx.quadraticCurveTo(s * 0.1, -s * 0.1, 0, -s * 0.5);
            ctx.stroke();
            for (let i = 0; i < 3; i++) {
              const yy = s * 0.3 - i * s * 0.3;
              ctx.beginPath();
              ctx.moveTo(0, yy);
              ctx.quadraticCurveTo(
                -s * 0.3,
                yy - s * 0.12,
                -s * 0.38,
                yy - s * 0.3,
              );
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(0, yy);
              ctx.quadraticCurveTo(
                s * 0.3,
                yy - s * 0.12,
                s * 0.38,
                yy - s * 0.3,
              );
              ctx.stroke();
            }
          } else if (kind === "arrow") {
            ctx.beginPath();
            ctx.moveTo(-s * 0.5, s * 0.2);
            ctx.quadraticCurveTo(0, -s * 0.35, s * 0.5, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s * 0.2, -s * 0.1);
            ctx.lineTo(s * 0.5, 0);
            ctx.lineTo(s * 0.25, s * 0.25);
            ctx.stroke();
          }
          ctx.restore();
        }

        function makePaperTexture(p) {
          const def = PAPERS[p.paper] || PAPERS.classic;
          const W = 512,
            ratio = p.type === "photo" ? 1.22 : rnd(1.05, 1.25);
          const H = Math.round(W * ratio);
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const ctx = c.getContext("2d");
          ctx.clearRect(0, 0, W, H);
          // torn silhouette (or crisp rect)
          ctx.save();
          if (def.torn) {
            tornPath(ctx, W, H, 10, def.rough);
            ctx.clip();
          }
          ctx.fillStyle = def.base;
          ctx.fillRect(0, 0, W, H);
          // tonal blotches
          for (let i = 0; i < 7; i++) {
            const g = ctx.createRadialGradient(
              Math.random() * W,
              Math.random() * H,
              10,
              Math.random() * W,
              Math.random() * H,
              rnd(90, 240),
            );
            g.addColorStop(
              0,
              i % 2 ? "rgba(255,255,255,.10)" : "rgba(120,95,60,.07)",
            );
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
          }
          speckle(ctx, W, H, (900 * def.grain * 10) | 0, def.grain * 0.9, true);
          speckle(ctx, W, H, 500, 0.06, false);
          // fibers
          ctx.strokeStyle = "rgba(110,90,60,.05)";
          for (let i = 0; i < 60; i++) {
            ctx.beginPath();
            const x = Math.random() * W,
              y = Math.random() * H;
            ctx.moveTo(x, y);
            ctx.lineTo(x + rnd(-18, 18), y + rnd(-4, 4));
            ctx.stroke();
          }
          // ruled / grid
          if (def.lines === "ruled") {
            ctx.strokeStyle = "rgba(120,140,180,.35)";
            ctx.lineWidth = 1.4;
            for (let y = 86; y < H - 30; y += 42) {
              ctx.beginPath();
              ctx.moveTo(26, y);
              ctx.lineTo(W - 20, y);
              ctx.stroke();
            }
            ctx.strokeStyle = "rgba(210,120,110,.4)";
            ctx.beginPath();
            ctx.moveTo(58, 20);
            ctx.lineTo(58, H - 20);
            ctx.stroke();
          } else if (def.lines === "grid") {
            ctx.strokeStyle = "rgba(120,140,120,.22)";
            ctx.lineWidth = 1;
            for (let y = 0; y < H; y += 34) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(W, y);
              ctx.stroke();
            }
            for (let x = 0; x < W; x += 34) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, H);
              ctx.stroke();
            }
          }
          if (def.spiral) {
            // punched holes down the left edge
            for (let y = 40; y < H - 20; y += 54) {
              ctx.fillStyle = "rgba(60,50,40,.45)";
              ctx.beginPath();
              ctx.arc(24, y, 7, 0, 7);
              ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,.5)";
              ctx.beginPath();
              ctx.arc(22, y - 2, 6, 0, 7);
              ctx.fill();
            }
          }
          // edge darkening
          ctx.strokeStyle = "rgba(90,70,45,.22)";
          ctx.lineWidth = 8;
          if (def.torn) {
            tornPath(ctx, W, H, 12, def.rough);
            ctx.stroke();
          } else {
            ctx.strokeRect(4, 4, W - 8, H - 8);
          }
          // ---- text ----
          const ink = def.ink || "#463a2b";
          const pad = def.spiral ? 62 : 44;
          const serif = p.font === "serif";
          const cjk = /[\u3400-\u9fff]/.test(p.text || "");
          let size = serif ? 56 : 52;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          let lines;
          for (;;) {
            ctx.font = serif
              ? cjk
                ? `600 ${size}px 'Noto Sans SC'`
                : `600 ${size}px 'Cormorant Garamond'`
              : cjk
                ? `400 ${size}px 'Ma Shan Zheng'`
                : `600 ${size}px Caveat`;
            lines = wrapText(ctx, p.text, W - pad * 2);
            if (lines.length * size * 1.22 < H * 0.62 || size < 30) break;
            size -= 3;
          }
          const totalH = lines.length * size * 1.22;
          let ty = H / 2 - totalH / 2 + size * 0.6 - H * 0.04;
          ctx.fillStyle = ink;
          lines.forEach((ln, i) => {
            ctx.save();
            ctx.translate(
              W / 2 + rnd(-3, 3),
              ty + i * size * 1.22 + rnd(-2, 2),
            );
            ctx.rotate(rnd(-0.012, 0.012)); /* human, not distorted */
            ctx.fillText(ln, 0, 0);
            ctx.restore();
          });
          if (p.doodle && p.doodle !== "none") {
            drawDoodle(
              ctx,
              p.doodle,
              W / 2,
              ty + lines.length * size * 1.22 + 30,
              46,
              ink + "b3",
            );
          }
          ctx.restore();
          const tex = new THREE.CanvasTexture(c);
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = 8;
          return { tex, ratio };
        }

        function makeEnvelopeTexture(p) {
          const W = 512,
            H = 560;
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const ctx = c.getContext("2d");
          ctx.clearRect(0, 0, W, H);
          ctx.fillStyle = "#f6ecda";
          ctx.fillRect(0, 0, W, H);
          speckle(ctx, W, H, 420, 0.06, true);
          const flap = ctx.createLinearGradient(0, 0, 0, 196);
          flap.addColorStop(0, "#e8d8b8");
          flap.addColorStop(1, "#dccaa8");
          ctx.fillStyle = flap;
          ctx.beginPath();
          ctx.moveTo(0, 196);
          ctx.lineTo(W / 2, 28);
          ctx.lineTo(W, 196);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "rgba(90,70,45,.18)";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "#d4785a";
          ctx.beginPath();
          ctx.arc(W - 78, 188, 22, 0, 7);
          ctx.fill();
          ctx.fillStyle = "rgba(255,244,234,.35)";
          ctx.beginPath();
          ctx.arc(W - 84, 182, 8, 0, 7);
          ctx.fill();
          const ink = "#3d3428";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(61,52,40,.45)";
          ctx.font = "500 22px 'Noto Sans SC'";
          ctx.fillText(p.city || "", W / 2, 258);
          if (p.text && p.text !== p.author) {
            ctx.fillStyle = ink;
            ctx.font = "600 34px 'Noto Sans SC'";
            const bits = wrapText(ctx, p.text, W - 96);
            bits.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, 318 + i * 42));
          }
          ctx.fillStyle = ink;
          ctx.font = "400 78px 'Ma Shan Zheng'";
          ctx.fillText(p.author || "", W / 2, 478);
          const tex = new THREE.CanvasTexture(c);
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = 8;
          return { tex, ratio: H / W };
        }

        function makePhotoTexture(p) {
          const W = 512,
            H = Math.round(W * 1.24),
            c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#faf7f0";
          ctx.fillRect(0, 0, W, H);
          speckle(ctx, W, H, 300, 0.04, true);
          const m = 34,
            ph = H - m * 2 - 86,
            pw = W - m * 2; // photo area, thicker bottom border
          ctx.save();
          ctx.translate(m, m);
          ctx.beginPath();
          ctx.rect(0, 0, pw, ph);
          ctx.clip();
          if (p.userImage) {
            // user-uploaded photograph
            const iw = p.userImage.width,
              ih = p.userImage.height,
              s = Math.max(pw / iw, ph / ih);
            ctx.drawImage(
              p.userImage,
              (pw - iw * s) / 2,
              (ph - ih * s) / 2,
              iw * s,
              ih * s,
            );
          } else if (p.photo === "beach") {
            let g = ctx.createLinearGradient(0, 0, 0, ph);
            g.addColorStop(0, "#b9d3d8");
            g.addColorStop(0.55, "#e8ddc4");
            g.addColorStop(1, "#dcc9a3");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, pw, ph);
            ctx.fillStyle = "#7fa8a4";
            ctx.fillRect(0, ph * 0.42, pw, ph * 0.2);
            ctx.fillStyle = "rgba(255,255,255,.55)";
            for (let i = 0; i < 4; i++) {
              ctx.fillRect(
                rnd(0, pw * 0.5),
                ph * 0.44 + i * ph * 0.045,
                rnd(70, 190),
                3,
              );
            }
            ctx.fillStyle = "#e6d5ae";
            ctx.beginPath();
            ctx.moveTo(0, ph * 0.62);
            ctx.quadraticCurveTo(pw * 0.5, ph * 0.55, pw, ph * 0.66);
            ctx.lineTo(pw, ph);
            ctx.lineTo(0, ph);
            ctx.closePath();
            ctx.fill();
          } else {
            // mountain
            let g = ctx.createLinearGradient(0, 0, 0, ph);
            g.addColorStop(0, "#ccd8da");
            g.addColorStop(0.6, "#ece1c6");
            g.addColorStop(1, "#e7dcbe");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, pw, ph);
            ctx.fillStyle = "rgba(245,235,205,.9)";
            ctx.beginPath();
            ctx.arc(pw * 0.72, ph * 0.24, 34, 0, 7);
            ctx.fill();
            const ridge = (base, color, amp) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.moveTo(0, base);
              for (let x = 0; x <= pw; x += 26)
                ctx.lineTo(
                  x,
                  base - Math.abs(Math.sin(x * 0.013 + base)) * amp - rnd(0, 8),
                );
              ctx.lineTo(pw, ph);
              ctx.lineTo(0, ph);
              ctx.closePath();
              ctx.fill();
            };
            ridge(ph * 0.52, "#8b9385", 60);
            ridge(ph * 0.66, "#5f6a58", 52);
            ridge(ph * 0.82, "#95a06b", 34);
            ctx.fillStyle = "#d8cfa6";
            ctx.beginPath();
            ctx.moveTo(pw * 0.42, ph);
            ctx.quadraticCurveTo(pw * 0.5, ph * 0.8, pw * 0.62, ph * 0.72);
            ctx.lineTo(pw * 0.66, ph * 0.72);
            ctx.quadraticCurveTo(pw * 0.56, ph * 0.82, pw * 0.52, ph);
            ctx.closePath();
            ctx.fill();
          }
          // vignette + grain
          const v = ctx.createRadialGradient(
            pw / 2,
            ph / 2,
            ph * 0.3,
            pw / 2,
            ph / 2,
            ph * 0.75,
          );
          v.addColorStop(0, "rgba(0,0,0,0)");
          v.addColorStop(1, "rgba(60,45,25,.18)");
          ctx.fillStyle = v;
          ctx.fillRect(0, 0, pw, ph);
          speckle(ctx, pw, ph, 400, 0.05, true);
          ctx.restore();
          ctx.strokeStyle = "rgba(90,70,45,.15)";
          ctx.lineWidth = 2;
          ctx.strokeRect(m, m, pw, ph);
          const tex = new THREE.CanvasTexture(c);
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = 8;
          return { tex, ratio: 1.24 };
        }

        function makeTapeTexture() {
          const c = document.createElement("canvas");
          c.width = 256;
          c.height = 96;
          const ctx = c.getContext("2d");
          ctx.clearRect(0, 0, 256, 96);
          ctx.beginPath();
          ctx.moveTo(8, rnd(4, 10));
          for (let y = 8; y <= 88; y += 10) ctx.lineTo(rnd(2, 12), y);
          ctx.lineTo(rnd(244, 254), 88);
          for (let y = 88; y >= 8; y -= 10) ctx.lineTo(rnd(244, 254), y);
          ctx.closePath();
          ctx.fillStyle = "rgba(230,215,180,.92)";
          ctx.fill();
          ctx.clip();
          speckle(ctx, 256, 96, 160, 0.1, true);
          ctx.strokeStyle = "rgba(120,95,60,.12)";
          for (let i = 0; i < 6; i++) {
            const y = rnd(8, 88);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(256, y + rnd(-6, 6));
            ctx.stroke();
          }
          const tex = new THREE.CanvasTexture(c);
          tex.encoding = THREE.sRGBEncoding;
          return tex;
        }

        function makeWallTexture() {
          const S = 1024,
            c = document.createElement("canvas");
          c.width = c.height = S;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#cbbfab";
          ctx.fillRect(0, 0, S, S);
          // tonal blotches, drawn wrapped so the texture tiles seamlessly
          for (let i = 0; i < 26; i++) {
            const bx = Math.random() * S,
              by = Math.random() * S,
              r = rnd(140, 420);
            const col =
              i % 3 ? "rgba(255,248,232,.10)" : "rgba(120,100,70,.10)";
            for (const ox of [-S, 0, S])
              for (const oy of [-S, 0, S]) {
                const g = ctx.createRadialGradient(
                  bx + ox,
                  by + oy,
                  20,
                  bx + ox,
                  by + oy,
                  r,
                );
                g.addColorStop(0, col);
                g.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, S, S);
              }
          }
          speckle(ctx, S, S, 5200, 0.08, true);
          speckle(ctx, S, S, 2600, 0.07, false);
          // hairline cracks (kept away from tile edges)
          ctx.strokeStyle = "rgba(90,72,50,.15)";
          ctx.lineWidth = 1;
          for (let i = 0; i < 10; i++) {
            let x = rnd(S * 0.2, S * 0.8),
              y = rnd(S * 0.1, S * 0.6);
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let k = 0; k < 8; k++) {
              x += rnd(-22, 22);
              y += rnd(6, 22);
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          // architectural seams (stone block joints), slightly irregular
          const seam = (x0, y0, x1, y1) => {
            ctx.lineCap = "round";
            ctx.strokeStyle = "rgba(80,64,44,.38)";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            const n = 8;
            for (let i = 1; i <= n; i++) {
              const t = i / n;
              ctx.lineTo(
                x0 + (x1 - x0) * t + rnd(-2, 2),
                y0 + (y1 - y0) * t + rnd(-2, 2),
              );
            }
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,248,230,.30)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x0 + 3, y0 + 4);
            ctx.lineTo(x1 + 3, y1 + 4);
            ctx.stroke();
          };
          const H1 = S * 0.3,
            H2 = S * 0.63;
          seam(0, 0, S, 0);
          seam(0, S, S, S); // tile borders become block joints
          seam(0, H1, S, H1);
          seam(0, H2, S, H2);
          seam(S * 0.34, 0, S * 0.34, H1);
          seam(S * 0.7, 0, S * 0.7, H1);
          seam(S * 0.18, H1, S * 0.18, H2);
          seam(S * 0.55, H1, S * 0.55, H2);
          seam(S * 0.86, H1, S * 0.86, H2);
          seam(S * 0.4, H2, S * 0.4, S);
          seam(S * 0.74, H2, S * 0.74, S);
          const tex = new THREE.CanvasTexture(c);
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = 8;
          // bump map: grayscale copy
          const b = document.createElement("canvas");
          b.width = b.height = S;
          const bc = b.getContext("2d");
          bc.filter = "grayscale(1) contrast(1.25)";
          bc.drawImage(c, 0, 0);
          const bump = new THREE.CanvasTexture(b);
          return { tex, bump };
        }

        function makeWoodTexture() {
          const c = document.createElement("canvas");
          c.width = 512;
          c.height = 256;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#a57f55";
          ctx.fillRect(0, 0, 512, 256);
          for (let i = 0; i < 70; i++) {
            ctx.strokeStyle = `rgba(${(60 + Math.random() * 40) | 0},${(42 + Math.random() * 30) | 0},20,${rnd(0.05, 0.2)})`;
            ctx.lineWidth = rnd(0.6, 2.4);
            const y = Math.random() * 256;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x <= 512; x += 32)
              ctx.lineTo(x, y + Math.sin(x * 0.02 + y) * 4 + rnd(-2, 2));
            ctx.stroke();
          }
          speckle(ctx, 512, 256, 500, 0.08, true);
          // floorboards: per-plank tint, gap lines, staggered end joints
          const PL = 64;
          for (let r = 0; r < 4; r++) {
            ctx.fillStyle = `rgba(${r % 2 ? 255 : 40},${r % 2 ? 230 : 26},${r % 2 ? 190 : 10},${rnd(0.03, 0.07)})`;
            ctx.fillRect(0, r * PL, 512, PL);
            ctx.strokeStyle = "rgba(35,22,10,.55)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, r * PL + 0.5);
            ctx.lineTo(512, r * PL + 0.5);
            ctx.stroke();
            const jx = (((r * 197) % 512) + 512) % 512; // staggered, tile-safe
            ctx.beginPath();
            ctx.moveTo(jx, r * PL);
            ctx.lineTo(jx, r * PL + PL);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,240,215,.18)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, r * PL + 2);
            ctx.lineTo(512, r * PL + 2);
            ctx.stroke();
          }
          const tex = new THREE.CanvasTexture(c);
          tex.encoding = THREE.sRGBEncoding;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          return tex;
        }

        /* ------------------------------------------------------------
   3. SCENE
------------------------------------------------------------ */
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(view().w, view().h, false);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.04;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#ddd4c2");
        const camera = new THREE.PerspectiveCamera(
          38,
          view().w / view().h,
          0.1,
          200,
        );
        const cam = { x: 0, y: 0, z: 34, tx: 0, ty: 0, tz: 34 };
        camera.position.set(0, 0, 34);

        scene.add(new THREE.HemisphereLight(0xfff4e2, 0x8d7d64, 0.8));
        const key = new THREE.DirectionalLight(0xfff1dc, 0.95);
        key.position.set(14, 18, 26);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.left = -40;
        key.shadow.camera.right = 40;
        key.shadow.camera.top = 26;
        key.shadow.camera.bottom = -32;
        key.shadow.camera.near = 2;
        key.shadow.camera.far = 80;
        key.shadow.bias = -0.0006;
        key.shadow.radius = 4;
        scene.add(key);
        const fill = new THREE.PointLight(0xffd9ad, 0.22, 90);
        fill.position.set(-18, 4, 20);
        scene.add(fill);

        // Wall — a real architectural wall, not a framed board.
        // It extends far past every camera position so you never see an edge,
        // and meets a wooden floor at the bottom like an actual room.
        const wallTx = makeWallTexture();
        const WALL_W = 64,
          WALL_H = 40; // logical pin-area (card clamps use this)
        const ROOM_W = 220,
          FLOOR_Y = -21,
          WALL_TOP = 62;
        const ROOM_H = WALL_TOP - FLOOR_Y;
        [wallTx.tex, wallTx.bump].forEach((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(ROOM_W / WALL_W, ROOM_H / WALL_H);
        });
        const wall = new THREE.Mesh(
          new THREE.PlaneGeometry(ROOM_W, ROOM_H),
          new THREE.MeshStandardMaterial({
            map: wallTx.tex,
            bumpMap: wallTx.bump,
            bumpScale: 0.4,
            roughness: 0.96,
            metalness: 0,
          }),
        );
        wall.position.y = (WALL_TOP + FLOOR_Y) / 2;
        wall.receiveShadow = true;
        scene.add(wall);
        scene.fog = new THREE.Fog(0xd7cdb9, 70, 160);

        // Wooden floor meeting the wall
        const woodTex = makeWoodTexture();
        woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
        woodTex.repeat.set(9, 4);
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(ROOM_W, 110),
          new THREE.MeshStandardMaterial({
            map: woodTex,
            color: 0xa8825c,
            roughness: 0.62,
            metalness: 0.06,
          }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, FLOOR_Y, 55);
        floor.receiveShadow = true;
        scene.add(floor);

        // Skirting board along the wall/floor junction
        const skirtMat = new THREE.MeshStandardMaterial({
          color: 0xe9e1cf,
          roughness: 0.55,
          metalness: 0.02,
        });
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(ROOM_W, 1.5, 0.55),
          skirtMat,
        );
        skirt.position.set(0, FLOOR_Y + 0.75, 0.28);
        skirt.castShadow = true;
        skirt.receiveShadow = true;
        scene.add(skirt);
        const skirtCap = new THREE.Mesh(
          new THREE.BoxGeometry(ROOM_W, 0.22, 0.72),
          skirtMat,
        );
        skirtCap.position.set(0, FLOOR_Y + 1.55, 0.3);
        skirtCap.castShadow = true;
        scene.add(skirtCap);

        // Soft contact shading where surfaces meet (baked AO gradients)
        function gradTex(vertical) {
          const c = document.createElement("canvas");
          c.width = 4;
          c.height = 128;
          const g = c.getContext("2d"),
            gr = g.createLinearGradient(
              0,
              vertical ? 128 : 0,
              0,
              vertical ? 0 : 128,
            );
          gr.addColorStop(0, "rgba(40,30,18,.34)");
          gr.addColorStop(1, "rgba(40,30,18,0)");
          g.fillStyle = gr;
          g.fillRect(0, 0, 4, 128);
          return new THREE.CanvasTexture(c);
        }
        const aoWall = new THREE.Mesh(
          new THREE.PlaneGeometry(ROOM_W, 4.5),
          new THREE.MeshBasicMaterial({
            map: gradTex(true),
            transparent: true,
            depthWrite: false,
          }),
        );
        aoWall.position.set(0, FLOOR_Y + 2.25 + 1.6, 0.05);
        scene.add(aoWall);
        const aoFloor = new THREE.Mesh(
          new THREE.PlaneGeometry(ROOM_W, 5),
          new THREE.MeshBasicMaterial({
            map: gradTex(true),
            transparent: true,
            depthWrite: false,
          }),
        );
        aoFloor.rotation.x = -Math.PI / 2;
        aoFloor.position.set(0, FLOOR_Y + 0.02, 2.5 + 0.55);
        scene.add(aoFloor);
        // faint upper falloff so the wall darkens gently toward the ceiling
        const aoTop = new THREE.Mesh(
          new THREE.PlaneGeometry(ROOM_W, 26),
          new THREE.MeshBasicMaterial({
            map: gradTex(false),
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          }),
        );
        aoTop.position.set(0, WALL_TOP - 13, 0.05);
        scene.add(aoTop);

        // Ambient dust
        const dustGeo = new THREE.BufferGeometry();
        const dustN = 110,
          dp = new Float32Array(dustN * 3),
          dv = [];
        for (let i = 0; i < dustN; i++) {
          dp[i * 3] = rnd(-26, 26);
          dp[i * 3 + 1] = rnd(-14, 14);
          dp[i * 3 + 2] = rnd(1, 9);
          dv.push([rnd(-0.05, 0.05), rnd(-0.03, 0.03)]);
        }
        dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
        const dust = new THREE.Points(
          dustGeo,
          new THREE.PointsMaterial({
            color: 0xfff3dd,
            size: 0.07,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
          }),
        );
        scene.add(dust);

        /* ------------------------------------------------------------
   4. CARD FACTORY
------------------------------------------------------------ */
        const cards = [],
          pickables = [];
        const pinGeoHead = new THREE.SphereGeometry(0.17, 20, 16);
        const pinGeoShaft = new THREE.CylinderGeometry(0.028, 0.028, 0.4, 10);

        function bendGeometry(geo, w, h) {
          const pos = geo.attributes.position;
          const amp = rnd(0.05, 0.12),
            ph = rnd(0, 6.28);
          const cx = ((Math.random() < 0.5 ? -1 : 1) * w) / 2,
            cy = h / 2,
            curl = rnd(0.1, 0.26),
            cr = rnd(1.1, 2) * (w * 0.4);
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i),
              y = pos.getY(i);
            let z = amp * Math.sin((x / w) * Math.PI + ph) * 0.6;
            const d = Math.hypot(x - cx, y - cy);
            z += curl * Math.exp(-(d * d) / cr);
            pos.setZ(i, z);
          }
          geo.computeVertexNormals();
        }

        function makeAttach(p, w, h, group) {
          if (p.attach === "string") {
            const metal = new THREE.MeshStandardMaterial({
              color: p.pinColor || 0x9a7b3f,
              roughness: 0.28,
              metalness: 0.85,
            });
            const head = new THREE.Mesh(pinGeoHead, metal);
            head.castShadow = true;
            head.position.set(0, h / 2 + 0.62, 0.28);
            head.scale.z = 0.75;
            const cord = new THREE.Mesh(
              new THREE.CylinderGeometry(0.012, 0.012, 0.72, 8),
              new THREE.MeshStandardMaterial({
                color: 0xc4b394,
                roughness: 0.7,
                metalness: 0.05,
              }),
            );
            cord.position.set(0, h / 2 + 0.28, 0.16);
            group.add(cord);
            group.add(head);
            group.userData.pinHead = head;
          } else if (p.attach === "tape") {
            const tape = new THREE.Mesh(
              new THREE.PlaneGeometry(1.7, 0.62),
              new THREE.MeshStandardMaterial({
                map: makeTapeTexture(),
                transparent: true,
                opacity: 0.9,
                roughness: 0.8,
                depthWrite: false,
              }),
            );
            tape.material.userData.baseOp = 0.9;
            tape.position.set(rnd(-0.3, 0.3), h / 2 - 0.05, 0.1);
            tape.rotation.z = rnd(-0.12, 0.12);
            tape.renderOrder = 2;
            group.add(tape);
          } else if (p.attach === "clip") {
            const dark = new THREE.MeshStandardMaterial({
              color: 0x2c2c30,
              roughness: 0.4,
              metalness: 0.6,
            });
            const body = new THREE.Mesh(
              new THREE.BoxGeometry(1.0, 0.45, 0.22),
              dark,
            );
            body.position.set(0, h / 2 + 0.1, 0.14);
            body.castShadow = true;
            group.add(body);
            const armMat = new THREE.MeshStandardMaterial({
              color: 0xb9b9c0,
              roughness: 0.3,
              metalness: 0.85,
            });
            for (const s of [-1, 1]) {
              const arm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8),
                armMat,
              );
              arm.position.set(s * 0.28, h / 2 + 0.45, 0.16);
              arm.rotation.z = s * 0.5;
              group.add(arm);
            }
          } else {
            const metal = new THREE.MeshStandardMaterial({
              color: p.pinColor || 0x9a7b3f,
              roughness: 0.28,
              metalness: 0.85,
            });
            const head = new THREE.Mesh(pinGeoHead, metal);
            head.castShadow = true;
            head.position.set(rnd(-0.4, 0.4), h / 2 - 0.35, 0.3);
            head.scale.z = 0.75;
            const shaft = new THREE.Mesh(
              pinGeoShaft,
              new THREE.MeshStandardMaterial({
                color: 0x777779,
                roughness: 0.35,
                metalness: 0.9,
              }),
            );
            shaft.rotation.x = Math.PI / 2;
            shaft.position.set(head.position.x, head.position.y, 0.12);
            group.add(shaft);
            group.add(head);
            group.userData.pinHead = head;
          }
        }

        function stackZ(x, y) {
          // physical stacking: a note placed over others sits on top of the pile
          let z = 0.24;
          for (const c of cards) {
            const q = c.userData;
            if (
              Math.abs(x - q.p.x) < (q.w || 6) * 0.5 + 2.4 &&
              Math.abs(y - q.p.y) < (q.h || 6) * 0.5 + 2.2
            )
              z = Math.max(z, (q.baseZ || 0.24) + 0.17);
          }
          return Math.min(z, 1.6);
        }

        function buildCard(p) {
          const { tex, ratio } =
            p.type === "photo"
              ? makePhotoTexture(p)
              : p.type === "envelope"
                ? makeEnvelopeTexture(p)
                : makePaperTexture(p);
          const w = p.w,
            h = w * ratio;
          const geo = new THREE.PlaneGeometry(w, h, 12, 12);
          bendGeometry(geo, w, h);
          const mat = new THREE.MeshStandardMaterial({
            map: tex,
            alphaTest: 0.5,
            roughness: 0.93,
            metalness: 0,
            side: THREE.DoubleSide,
          });
          mat.emissive = new THREE.Color(0xffc98a);
          mat.emissiveIntensity = 0;
          const paper = new THREE.Mesh(geo, mat);
          paper.castShadow = true;
          paper.receiveShadow = true;
          paper.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: tex,
            alphaTest: 0.5,
          });
          const group = new THREE.Group();
          group.add(paper);
          makeAttach(p, w, h, group);
          const baseZ = stackZ(p.x, p.y);
          group.position.set(p.x, p.y, baseZ);
          group.rotation.z = (p.rot * Math.PI) / 180;
          Object.assign(group.userData, {
            p,
            paper,
            w,
            h,
            baseZ,
            lift: 0,
            tLift: 0,
            sc: 1,
            tSc: 1,
            dim: { v: 0 },
            baseRot: (p.rot * Math.PI) / 180,
            phase: rnd(0, 6.28),
            glow: { v: 0 },
          });
          paper.userData.group = group;
          scene.add(group);
          cards.push(group);
          pickables.push(paper);
          return group;
        }

        /* ------------------------------------------------------------
   5. SOUND (tiny, synthesized, subtle)
------------------------------------------------------------ */
        let AC = null;
        function ensureAudio() {
          if (!AC) {
            try {
              AC = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {}
          }
        }
        function tap(freq, dur, gain) {
          if (!AC || REDUCED) return;
          const o = AC.createOscillator(),
            g = AC.createGain();
          o.frequency.value = freq;
          o.type = "triangle";
          g.gain.setValueAtTime(gain, AC.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
          o.connect(g).connect(AC.destination);
          o.start();
          o.stop(AC.currentTime + dur);
        }

        /* ------------------------------------------------------------
   6. INTERACTION — hover, pan, zoom, select
------------------------------------------------------------ */
        const ray = new THREE.Raycaster(),
          ndc = new THREE.Vector2();
        const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        let hovered = null,
          selected = null,
          dragging = false,
          downPos = null,
          moved = false;
        let placing = null; // {group, target:Vector3, prev:Vector3}
        const mouseN = { x: 0, y: 0 };

        let px = view().w / 2,
          py = view().h / 2;
        function setNDC(e) {
          const v = view();
          ndc.x = ((e.clientX - v.left) / v.w) * 2 - 1;
          ndc.y = -((e.clientY - v.top) / v.h) * 2 + 1;
        }
        function wallPointAt(cx, cy) {
          const box = view();
          ndc.x = ((cx - box.left) / box.w) * 2 - 1;
          ndc.y = -((cy - box.top) / box.h) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          const v = new THREE.Vector3();
          ray.ray.intersectPlane(wallPlane, v);
          return v;
        }
        function wallPoint(e) {
          return wallPointAt(e.clientX, e.clientY);
        }

        onEl(canvas, "pointermove", (e) => {
          mouseN.x = ndc.x;
          mouseN.y = ndc.y;
          setNDC(e);
          px = e.clientX;
          py = e.clientY;
          if (placing) {
            const v = wallPoint(e);
            if (v) placing.target.copy(v);
            return;
          }
          if (dragging && downPos) {
            moved = true;
            const dx = (e.clientX - downPos.sx) / view().w,
              dy = (e.clientY - downPos.sy) / view().h;
            cam.tx = clamp(downPos.cx - dx * cam.z * 1.5, -26, 26);
            cam.ty = clamp(downPos.cy + dy * cam.z * 1.0, -14, 14);
            return;
          }
          ray.setFromCamera(ndc, camera);
          const hit = ray.intersectObjects(pickables)[0];
          const g = hit ? hit.object.userData.group : null;
          if (g !== hovered) {
            if (hovered) {
              hovered.userData.tLift = 0;
              hovered.userData.tSc = 1;
            }
            hovered = g;
            if (hovered && hovered !== selected) {
              hovered.userData.tLift = 0.5;
              hovered.userData.tSc = 1.035;
              tap(2400, 0.02, 0.015);
            }
            canvas.classList.toggle("hovering", !!hovered);
          }
        });
        onEl(canvas, "pointerdown", (e) => {
          ensureAudio();
          if (placing) return;
          downPos = { sx: e.clientX, sy: e.clientY, cx: cam.tx, cy: cam.ty };
          dragging = true;
          moved = false;
          canvas.classList.add("dragging");
        });
        onWin("pointerup", (e) => {
          canvas.classList.remove("dragging");
          if (placing) {
            if (e.target === canvas) finalizePlacement(e);
            dragging = false;
            return;
          }
          if (!dragging) return;
          dragging = false;
          const dist = downPos
            ? Math.hypot(e.clientX - downPos.sx, e.clientY - downPos.sy)
            : 99;
          if (dist < 5 && e.target === canvas) {
            if (hovered) selectCard(hovered);
            else if (selected) closePanel();
          }
          downPos = null;
        });
        onEl(
          canvas,
          "wheel",
          (e) => {
            e.preventDefault();
            cam.tz = clamp(cam.tz + e.deltaY * 0.02, 15, 46);
          },
          { passive: false },
        );

        /* ---- selection & detail panel ---- */
        const stub = () => {
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
        const el = (id) => document.getElementById(id) || stub();
        let localReflections = [];
        function selectCard(g, opts = {}) {
          if (selected === g) return;
          if (selected) {
            resetCard(selected);
          }
          selected = g;
          const u = g.userData;
          u.tLift = 0.9;
          u.tSc = 1.05;
          cards.forEach((c) => {
            if (c !== g)
              gsap.to(c.userData.dim, {
                v: 0.62,
                duration: 0.6,
                ease: "power2.out",
              });
          });
          gsap.to(u.dim, { v: 0, duration: 0.4 });
          if (opts.moveCamera !== false) {
            gsap.to(cam, {
              tx: clamp(g.position.x + 4.5, -20, 20),
              ty: clamp(g.position.y, -11, 11),
              tz: 19,
              duration: REDUCED ? 0 : 1.1,
              ease: "power3.inOut",
            });
          }
          const p = u.p;
          el("pCat").textContent = p.category.toUpperCase();
          el("pCat").style.color =
            {
              Health: "#c05f4a",
              Kindness: "#b3766a",
              Learning: "#7a6f9b",
              Family: "#8a9a7b",
              Work: "#8a744a",
            }[p.category] || "var(--accent)";
          el("pTitle").textContent = p.text;
          el("pBody").textContent = p.body;
          el("pAuthor").textContent = "— " + p.author;
          el("pDate").textContent = "Pinned on " + p.date;
          el("sSupport").textContent = p.support;
          el("sReflect").textContent = p.reflect;
          el("sSaves").textContent = p.saves;
          el("pHeart").classList.toggle("on", !!p._hearted);
          el("btnSupport").classList.toggle("active", !!p._hearted);
          el("pSave").classList.toggle("saved", !!p._saved);
          el("pSave").querySelector("span").textContent = p._saved
            ? "Saved to collection"
            : "Save Promise";
          el("reflectBox").classList.remove("open");
          renderReflections(p);
          panel.classList.add("open");
          onSelect(p);
        }
        function resetCard(g) {
          const u = g.userData;
          u.tLift = 0;
          u.tSc = 1;
        }
        function closePanel() {
          panel.classList.remove("open");
          if (selected) {
            resetCard(selected);
            selected = null;
          }
          cards.forEach((c) =>
            gsap.to(c.userData.dim, {
              v: activeFilter && !activeFilter(c.userData.p) ? 0.75 : 0,
              duration: 0.5,
            }),
          );
          gsap.to(cam, {
            tz: 30,
            duration: REDUCED ? 0 : 0.9,
            ease: "power3.inOut",
          });
          onVacant();
        }
        el("pClose").addEventListener("click", closePanel);
        function bump(elm) {
          gsap.fromTo(
            elm,
            { scale: 1.25 },
            { scale: 1, duration: 0.4, ease: "back.out(3)" },
          );
        }
        function heartToggle() {
          if (!selected) return;
          const p = selected.userData.p;
          p._hearted = !p._hearted;
          p.support += p._hearted ? 1 : -1;
          el("sSupport").textContent = p.support;
          el("pHeart").classList.toggle("on", p._hearted);
          el("btnSupport").classList.toggle("active", p._hearted);
          bump(el("pHeart"));
          tap(1600, 0.05, 0.05);
        }
        el("pHeart").addEventListener("click", heartToggle);
        el("btnSupport").addEventListener("click", heartToggle);
        el("btnReflect").addEventListener("click", () => {
          el("reflectBox").classList.toggle("open");
          el("reflectText").focus();
        });
        el("reflectSend").addEventListener("click", () => {
          const t = el("reflectText").value.trim();
          if (!t || !selected) return;
          const p = selected.userData.p;
          (p._refl = p._refl || []).unshift({ who: "You", text: t });
          p.reflect++;
          el("sReflect").textContent = p.reflect;
          el("reflectText").value = "";
          el("reflectBox").classList.remove("open");
          renderReflections(p);
          toast("Reflection added. 🌱".replace(" 🌱", ""));
        });
        function renderReflections(p) {
          const box = el("reflections");
          box.innerHTML = "";
          (p._refl || []).forEach((r) => {
            const d = document.createElement("div");
            d.className = "refl";
            d.innerHTML =
              "<b>" + r.who + "</b> · " + r.text.replace(/</g, "&lt;");
            box.appendChild(d);
          });
        }
        el("pSave").addEventListener("click", () => {
          if (!selected) return;
          const p = selected.userData.p;
          p._saved = !p._saved;
          p.saves += p._saved ? 1 : -1;
          el("sSaves").textContent = p.saves;
          el("pSave").classList.toggle("saved", p._saved);
          el("pSave").querySelector("span").textContent = p._saved
            ? "Saved to collection"
            : "Save Promise";
          toast(
            p._saved
              ? "Saved to your collection."
              : "Removed from your collection.",
          );
        });
        el("pReport").addEventListener("click", () =>
          toast("Thanks — our community team will take a look."),
        );

        /* ------------------------------------------------------------
   7. SEARCH + CATEGORY FILTER
------------------------------------------------------------ */
        let activeFilter = null;
        function applyFilter(fn) {
          activeFilter = fn;
          const matched = [];
          cards.forEach((c) => {
            const ok = !fn || fn(c.userData.p);
            gsap.to(c.userData.dim, {
              v: ok ? 0 : 0.78,
              duration: 0.55,
              ease: "power2.out",
            });
            c.userData.tLift = ok && fn ? 0.35 : c === hovered ? 0.5 : 0;
            if (ok) matched.push(c);
          });
          if (fn && matched.length) {
            let mx = 0,
              my = 0;
            matched.forEach((c) => {
              mx += c.position.x;
              my += c.position.y;
            });
            gsap.to(cam, {
              tx: clamp(mx / matched.length, -20, 20),
              ty: clamp(my / matched.length, -11, 11),
              tz: matched.length > 3 ? 32 : 24,
              duration: REDUCED ? 0 : 1,
              ease: "power3.inOut",
            });
          }
        }
        const searchInput = el("searchInput");
        searchInput.addEventListener("input", () => {
          const q = searchInput.value.trim().toLowerCase();
          if (!q) {
            applyFilter(null);
            return;
          }
          applyFilter(
            (p) =>
              p.text.toLowerCase().includes(q) ||
              p.author.toLowerCase().includes(q) ||
              p.category.toLowerCase().includes(q) ||
              (p.tags || []).some((t) => t.includes(q.replace("#", ""))),
          );
        });
        onWin("keydown", (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            searchInput.focus();
          }
          if (e.key === "Escape") {
            if (placing) cancelPlacement();
            else if (composeWrap.classList.contains("open")) closeCompose();
            else if (selected) closePanel();
          }
        });
        document.querySelectorAll(".nav-item.cat").forEach((b) => {
          b.addEventListener("click", () => {
            document
              .querySelectorAll(".nav-item")
              .forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            const cat = b.dataset.cat;
            searchInput.value = "";
            applyFilter(cat ? (p) => p.category === cat : null);
          });
        });
        document.querySelectorAll(".nav-item[data-nav]").forEach((b) => {
          b.addEventListener("click", () => {
            document
              .querySelectorAll(".nav-item")
              .forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            if (b.dataset.nav === "mine")
              applyFilter((p) => p.author === "Jess");
            else applyFilter(null);
          });
        });

        /* ------------------------------------------------------------
   8. COMPOSE + PLACEMENT
------------------------------------------------------------ */
        const composeWrap = el("composeWrap");
        let draft = { category: "Self-Growth", paper: "classic" };
        const catChips = el("catChips");
        CATEGORIES.forEach((c) => {
          const b = document.createElement("button");
          b.className = "chip";
          b.textContent = c;
          if (c === draft.category) b.classList.add("on");
          b.addEventListener("click", () => {
            draft.category = c;
            catChips
              .querySelectorAll(".chip")
              .forEach((x) => x.classList.remove("on"));
            b.classList.add("on");
          });
          catChips.appendChild(b);
        });
        const paperRow = el("paperRow");
        Object.entries(PAPERS).forEach(([k, v]) => {
          const b = document.createElement("button");
          b.className = "paper-swatch";
          b.style.cssText = v.swatch;
          b.setAttribute("aria-label", v.label);
          if (k === draft.paper) b.classList.add("on");
          const s = document.createElement("span");
          s.textContent = v.label;
          b.appendChild(s);
          b.addEventListener("click", () => {
            draft.paper = k;
            paperRow
              .querySelectorAll(".paper-swatch")
              .forEach((x) => x.classList.remove("on"));
            b.classList.add("on");
          });
          paperRow.appendChild(b);
        });
        function openCompose(prefill) {
          el("promiseText").value = prefill || "";
          composeWrap.classList.add("open");
          setTimeout(() => el("promiseText").focus(), 80);
        }
        function closeCompose() {
          composeWrap.classList.remove("open");
        }
        el("addBtn").addEventListener("click", () => openCompose());
        el("startWrite").addEventListener("click", () => openCompose());
        el("startTemplate").addEventListener("click", () =>
          openCompose(TEMPLATES[(Math.random() * TEMPLATES.length) | 0]),
        );
        el("cancelBtn").addEventListener("click", closeCompose);
        composeWrap.addEventListener("click", (e) => {
          if (e.target === composeWrap) closeCompose();
        });

        el("placeBtn").addEventListener("click", () => {
          const text = el("promiseText").value.trim();
          if (!text) {
            el("promiseText").focus();
            el("promiseText").placeholder = "Write your promise first…";
            return;
          }
          const tags = el("tagInput")
            .value.split(/[\s,]+/)
            .map((t) => t.replace("#", "").trim())
            .filter(Boolean);
          const now = new Date();
          const p = P({
            text,
            category: draft.category,
            paper: draft.paper,
            tags,
            author: "Jess",
            attach:
              draft.paper === "pastelGreen" || Math.random() < 0.22
                ? "tape"
                : "pin",
            date: now.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            ago: "just now",
            support: 0,
            reflect: 0,
            saves: 0,
            x: 0,
            y: 0,
            body: "A brand-new promise, freshly pinned.",
            doodle: ["none", "heart", "sprig", "star"][(Math.random() * 4) | 0],
            w: clamp(3.4 + text.length * 0.02, 3.4, 5.4),
          });
          closeCompose();
          startPlacement(p);
        });

        function startPlacement(p) {
          const g = buildCard(p);
          cards.pop();
          pickables.pop(); // not interactive yet
          g.position.set(cam.x, cam.y, 1.6);
          placing = {
            group: g,
            p,
            target: new THREE.Vector3(cam.x, cam.y, 0),
            prev: new THREE.Vector3(cam.x, cam.y, 0),
          };
          canvas.classList.add("placing");
          el("placeHint").classList.add("show");
          el("addBtn").style.display = "none";
          el("addHint").style.display = "none";
        }
        function cancelPlacement() {
          if (!placing) return;
          scene.remove(placing.group);
          placing = null;
          canvas.classList.remove("placing");
          el("placeHint").classList.remove("show");
          el("addBtn").style.display = "";
          el("addHint").style.display = "";
        }
        function finalizePlacement(e) {
          const v = wallPoint(e);
          if (!v) return;
          const g = placing.group,
            p = placing.p;
          placing = null;
          canvas.classList.remove("placing");
          el("placeHint").classList.remove("show");
          el("addBtn").style.display = "";
          el("addHint").style.display = "";
          p.x = clamp(v.x, -WALL_W / 2 + 4, WALL_W / 2 - 4);
          p.y = clamp(v.y, -WALL_H / 2 + 4, WALL_H / 2 - 4);
          const finalRot = (rnd(-3, 3) * Math.PI) / 180;
          const baseZ = stackZ(p.x, p.y); // land on top of any notes beneath
          g.userData.baseZ = baseZ;
          const pinHead = g.userData.pinHead;
          const pinZ0 = pinHead ? pinHead.position.z : 0;
          if (pinHead) {
            pinHead.position.z = 2.2;
            pinHead.material.transparent = true;
            pinHead.material.opacity = 0;
          }
          g.userData.baseRot = finalRot;
          const commit = () => {
            cards.push(g);
            pickables.push(g.userData.paper);
          };
          // pin-it timeline: paper flies to wall → settles → pin presses in → compresses
          if (REDUCED) {
            g.position.set(p.x, p.y, baseZ);
            g.rotation.set(0, 0, finalRot);
            if (pinHead) {
              pinHead.position.z = pinZ0;
              pinHead.material.opacity = 1;
            }
            commit();
          } else {
            const tl = gsap.timeline({ onComplete: commit });
            tl.to(
              g.position,
              { x: p.x, y: p.y, duration: 0.32, ease: "power2.out" },
              0,
            )
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
              .to(
                g.rotation,
                { x: 0, y: 0, z: finalRot, duration: 0.45, ease: "power2.out" },
                0,
              )
              .to(
                g.scale,
                { y: 0.965, duration: 0.09, ease: "power2.in" },
                0.42,
              )
              .to(
                g.scale,
                { y: 1, duration: 0.6, ease: "elastic.out(1,.4)" },
                0.51,
              );
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
          store.promises.unshift(p);
          renderRecent();
          toast("Promise pinned to the wall.");
        }

        /* ------------------------------------------------------------
   9. RECENTLY ADDED DOCK
------------------------------------------------------------ */
        function findCard(p) {
          return cards.find((c) => c.userData.p === p);
        }
        function renderRecent() {
          const row = el("recentRow");
          row.innerHTML = "";
          const recents = [...store.promises]
            .filter((p) => p.type !== "photo")
            .sort((a, b) => agoMin(a.ago) - agoMin(b.ago))
            .slice(0, 4);
          recents.forEach((p) => {
            const d = document.createElement("button");
            d.className = "mini";
            d.style.background = PAPERS[p.paper].base;
            d.innerHTML = `${p.text.length > 46 ? p.text.slice(0, 44) + "…" : p.text}
      <span class="mfoot"><span class="mava"></span>${p.ago}
      <span class="mheart"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg></span></span>`;
            d.addEventListener("mouseenter", () => {
              const c = findCard(p);
              if (c) {
                c.userData.tSc = 1.07;
                c.userData.tLift = 0.6;
                gsap.to(c.userData.glow, { v: 0.3, duration: 0.4 });
              }
            });
            d.addEventListener("mouseleave", () => {
              const c = findCard(p);
              if (c && c !== selected) {
                c.userData.tSc = 1;
                c.userData.tLift = 0;
                gsap.to(c.userData.glow, { v: 0, duration: 0.5 });
              }
            });
            d.addEventListener("click", () => {
              const c = findCard(p);
              if (c) selectCard(c);
            });
            row.appendChild(d);
          });
        }
        function agoMin(a) {
          const n = parseFloat(a) || 0;
          return a.includes("just")
            ? 0
            : a.includes("m ")
              ? n
              : a.includes("h")
                ? n * 60
                : n * 1440;
        }

        /* ------------------------------------------------------------
   10. TOAST
------------------------------------------------------------ */
        let toastT = null;
        function toast(msg) {
          el("toastText").textContent = msg;
          el("toast").classList.add("show");
          clearTimeout(toastT);
          toastT = setTimeout(() => el("toast").classList.remove("show"), 2600);
        }

        /* ------------------------------------------------------------
   11. MAIN LOOP
------------------------------------------------------------ */
        const addBtnEl = el("addBtn"),
          addHintEl = el("addHint");
        const addAnchor = new THREE.Vector3(1.4, -2.9, 0.6),
          hintAnchor = new THREE.Vector3(2.5, -5.4, 0.6);
        const proj = new THREE.Vector3();
        function project(worldV, elm, ox, oy) {
          proj.copy(worldV).project(camera);
          elm.style.left = (proj.x * 0.5 + 0.5) * view().w + (ox || 0) + "px";
          elm.style.top =
            (-proj.y * 0.5 + 0.5) * view().h + (oy || 0) + "px";
        }
        let last = performance.now();
        function loop(now) {
          if (!live) return;
          raf = requestAnimationFrame(loop);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const t = now / 1000;
          // camera spring
          cam.x += (cam.tx - cam.x) * 0.08;
          cam.y += (cam.ty - cam.y) * 0.08;
          cam.z += (cam.tz - cam.z) * 0.08;
          camera.position.set(cam.x, cam.y, cam.z);
          camera.lookAt(cam.x + ndc.x * 0.5, cam.y + ndc.y * 0.35, 0);
          // cards
          for (const g of cards) {
            const u = g.userData;
            u.lift += (u.tLift - u.lift) * 0.12;
            u.sc += (u.tSc - u.sc) * 0.12;
            g.position.z = u.baseZ + u.lift;
            g.scale.setScalar(u.sc);
            const sway = REDUCED
              ? 0
              : Math.sin(t * 0.55 + u.phase) * 0.006 +
                u.lift * 0.02 * Math.sin(t * 2.2 + u.phase);
            g.rotation.z = u.baseRot + sway;
            g.rotation.x = REDUCED
              ? 0
              : Math.sin(t * 0.4 + u.phase) * 0.004 + u.lift * 0.06;
            const op = 1 - u.dim.v * 0.72;
            g.traverse((o) => {
              if (o.material && o.material.opacity !== undefined) {
                const base =
                  (o.material.userData && o.material.userData.baseOp) || 1;
                o.material.opacity = op * base;
                o.material.transparent = base < 1 || op < 0.999; // opaque pass when fully visible
              }
            });
            u.paper.material.opacity = op;
            u.paper.material.transparent = op < 0.999;
            u.paper.material.emissiveIntensity = u.glow.v + u.lift * 0.05;
          }
          // placement preview physics: lag + velocity tilt + edge auto-pan
          if (placing) {
            // holding a note near a screen edge glides the camera so empty
            // corners of the wall are reachable
            const M = 80,
              sp = 26 * dt * (cam.z / 34);
            if (px < M) cam.tx = clamp(cam.tx - sp * (1 - px / M), -26, 26);
            if (px > view().w - M)
              cam.tx = clamp(
                cam.tx + sp * (1 - (view().w - px) / M),
                -26,
                26,
              );
            if (py < M) cam.ty = clamp(cam.ty + sp * (1 - py / M), -14, 14);
            if (py > view().h - M)
              cam.ty = clamp(
                cam.ty - sp * (1 - (view().h - py) / M),
                -14,
                14,
              );
            const rt = wallPointAt(px, py);
            if (rt) placing.target.copy(rt);
            const g = placing.group,
              tg = placing.target;
            const vx = tg.x - placing.prev.x,
              vy = tg.y - placing.prev.y;
            placing.prev.lerp(tg, 0.5);
            g.position.x += (tg.x - g.position.x) * 0.14;
            g.position.y += (tg.y - g.position.y) * 0.14;
            g.position.z = 1.6 + Math.sin(t * 2) * 0.05;
            g.rotation.z +=
              (clamp(-vx * 0.35, -0.28, 0.28) - g.rotation.z) * 0.1;
            g.rotation.x += (clamp(vy * 0.3, -0.22, 0.22) - g.rotation.x) * 0.1;
          }
          // dust drift
          const pos = dust.geometry.attributes.position;
          for (let i = 0; i < dustN; i++) {
            let x = pos.getX(i) + dv[i][0] * dt * 8,
              y = pos.getY(i) + dv[i][1] * dt * 8 + Math.sin(t + i) * 0.001;
            if (x > 27) x = -27;
            if (x < -27) x = 27;
            if (y > 15) y = -15;
            if (y < -15) y = 15;
            pos.setX(i, x);
            pos.setY(i, y);
          }
          pos.needsUpdate = true;
          if (live) renderer.render(scene, camera);
        }
        const fit = () => {
          if (!live) return;
          camera.aspect = view().w / view().h;
          camera.updateProjectionMatrix();
          renderer.setSize(view().w, view().h, false);
        };
        onWin("resize", fit);
        const ro = new ResizeObserver(fit);

        /* ------------------------------------------------------------
   12. BOOT — wait for fonts, build wall, open the hero card
------------------------------------------------------------ */
        const fontWait = Promise.race([
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
          const g = id ? cards.find((c) => c.userData.p.id === id) : null;
          if (g) selectCard(g, opts);
          else if (selected) closePanel();
        }

        return { destroy, selectById, closePanel, cards };

}
