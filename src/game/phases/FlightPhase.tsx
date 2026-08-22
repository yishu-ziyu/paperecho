import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { sfxCharge, sfxThunder, unlockAudio } from "../audio";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { Craft, CRAFT_ID, PullCommit } from "../continuum";
import { EMOTION_MAP, ownedOf } from "../emotions";
import { dur, ease, spring } from "../motion";
import { useGame } from "../store";

const MIN_FLIGHT_MS = 5000;
const HIT_COPY = ["差点就掉头了", "还飞着"] as const;
const LAMP_COPY = ["有人把灯开着", "窗还亮着", "下面有人没睡"] as const;
const MAX_SPEED = 1080;
const FAR_CLOUDS = [
  { x: -8, y: 10, w: 26 },
  { x: 72, y: 22, w: 30 },
  { x: 38, y: 4, w: 22 },
];

const CLOUDS = [
  { x: 8, y: 14, w: 38 },
  { x: 52, y: 8, w: 34 },
  { x: 18, y: 38, w: 32 },
  { x: 58, y: 46, w: 36 },
  { x: 30, y: 58, w: 28 },
];

type Wake = "idle" | "warn" | "boom";
type Cloud = { id: number; x: number; y: number; w: number; wake: Wake };
type Lamp = { id: number; x: number; y: number; color: string; taken: boolean };
type Sample = { t: number; x: number; y: number; r: number };

export function FlightPhase() {
  const searching = useGame((s) => s.searching);
  const note = useGame((s) => s.searchNote);
  const echo = useGame((s) => s.echo);
  const arrive = useGame((s) => s.arrive);
  const power = useGame((s) => s.throwPower);
  const scorch = useGame((s) => s.scorch);
  const markScorch = useGame((s) => s.markScorch);
  const fingerprint = useGame((s) => s.fingerprint);
  const reduce = useReducedMotion();
  const found = !searching && Boolean(echo);
  const [elapsed, setElapsed] = useState(Boolean(reduce));
  const [progress, setProgress] = useState(12);
  const [hitLine, setHitLine] = useState("");
  const [flash, setFlash] = useState(false);
  const [clouds, setClouds] = useState<Cloud[]>(() =>
    CLOUDS.slice(0, 3 + Math.round(Math.min(1, power) * 2)).map((c, i) => ({
      id: i,
      x: c.x,
      y: c.y,
      w: c.w,
      wake: "idle" as Wake,
    })),
  );
  const hues = useMemo(() => {
    const owned = ownedOf(fingerprint, 0.3);
    const cols = owned.map((f) => EMOTION_MAP[f.id].color);
    return cols.length ? cols : ["#d4785a", "#e8c56b", "#7a9a68"];
  }, [fingerprint]);
  const [lamps, setLamps] = useState<Lamp[]>(() =>
    hues.slice(0, 4).map((color, i) => ({
      id: i,
      x: 16 + i * 22 + (i % 2) * 6,
      y: 68 + (i % 2) * 8,
      color,
      taken: false,
    })),
  );
  const fieldRef = useRef<HTMLDivElement>(null);
  const cloudsRef = useRef(clouds);
  const lampsRef = useRef(lamps);
  cloudsRef.current = clouds;
  lampsRef.current = lamps;
  const stunnedUntil = useRef(0);
  const cooldownUntil = useRef(0);
  const bornRef = useRef(performance.now());
  const target = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0, r: 0 });
  const cam = useRef({ x: 0, y: 0 });
  const lastTick = useRef(performance.now());
  const history = useRef<Sample[]>([]);
  const px = useMotionValue(0);
  const py = useMotionValue(reduce ? 0 : 12);
  const rot = useMotionValue(-6);
  const punch = useMotionValue(0);
  const camX = useMotionValue(0);
  const camY = useMotionValue(0);
  const stretch = useMotionValue(1);
  const g1x = useMotionValue(0);
  const g1y = useMotionValue(0);
  const g1r = useMotionValue(-6);
  const g1o = useMotionValue(0);
  const g2x = useMotionValue(0);
  const g2y = useMotionValue(0);
  const g2r = useMotionValue(-6);
  const g2o = useMotionValue(0);
  const visX = useTransform([px, camX], (v) => Number(v[0]) - Number(v[1]));
  const visY = useTransform([py, camY], (v) => Number(v[0]) - Number(v[1]));
  const worldX = useTransform(camX, (v) => -v);
  const worldY = useTransform(camY, (v) => -v);
  const farX = useTransform(camX, (v) => -v * 0.34);
  const farY = useTransform(camY, (v) => -v * 0.22);
  const scaleY = useTransform(stretch, (s) => 1 / Math.max(0.78, s));
  const ready = found && elapsed;

  useEffect(() => {
    if (reduce) {
      setElapsed(true);
      return;
    }
    const left = MIN_FLIGHT_MS - (performance.now() - bornRef.current);
    const t = window.setTimeout(() => setElapsed(true), Math.max(0, left));
    return () => window.clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    if (ready) {
      setProgress(100);
      return;
    }
    const t = window.setInterval(() => {
      setProgress((v) => (v >= 88 ? v : v + 2));
    }, 220);
    return () => window.clearInterval(t);
  }, [ready]);

  useEffect(() => {
    if (reduce || ready) return;
    let alive = true;
    const density = 2400 - Math.min(0.95, power) * 800;
    const rumble = () => {
      if (!alive) return;
      const idle = cloudsRef.current.filter((c) => c.wake === "idle");
      const pick = idle[Math.floor(Math.random() * idle.length)];
      if (!pick) return;
      setClouds((cs) => cs.map((c) => (c.id === pick.id ? { ...c, wake: "warn" } : c)));
      window.setTimeout(() => {
        if (!alive) return;
        setClouds((cs) => cs.map((c) => (c.id === pick.id ? { ...c, wake: "boom" } : c)));
        setFlash(true);
        window.setTimeout(() => {
          if (alive) setFlash(false);
        }, 160);
      }, 700);
      window.setTimeout(() => {
        if (!alive) return;
        setClouds((cs) => cs.map((c) => (c.id === pick.id ? { ...c, wake: "idle" } : c)));
      }, 1100);
    };
    rumble();
    const t = window.setInterval(rumble, density);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [reduce, ready, power]);

  useEffect(() => {
    if (!ready) return;
    setClouds((cs) => cs.map((c) => ({ ...c, wake: "idle" })));
  }, [ready]);

  useEffect(() => {
    if (reduce || ready) return;
    let raf = 0;
    const at = (now: number, ago: number, fallback: Sample): Sample => {
      const t = now - ago;
      let s = history.current[0] ?? fallback;
      for (const h of history.current) {
        if (h.t <= t) s = h;
      }
      return s;
    };
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.032, (now - lastTick.current) / 1000);
      lastTick.current = now;
      const field = fieldRef.current;
      const stunned = now < stunnedUntil.current;

      if (field) {
        const k = stunned ? 10 : 92;
        const damp = stunned ? 2.4 : 5.2;
        const x = px.get();
        const y = py.get();
        vel.current.x += (target.current.x - x) * k * dt;
        vel.current.y += (target.current.y - y) * k * dt;
        const falloff = Math.exp(-damp * dt);
        vel.current.x *= falloff;
        vel.current.y *= falloff;
        const spd = Math.hypot(vel.current.x, vel.current.y);
        const cap = stunned ? 260 : MAX_SPEED;
        if (spd > cap) {
          vel.current.x *= cap / spd;
          vel.current.y *= cap / spd;
        }
        px.set(x + vel.current.x * dt);
        py.set(y + vel.current.y * dt);
        vel.current.r *= Math.exp(-8 * dt);
        const bank = Math.max(
          -32,
          Math.min(32, vel.current.x * 0.022 + vel.current.y * 0.03),
        );
        rot.set(rot.get() + vel.current.r * dt + (bank - rot.get()) * Math.min(1, 10 * dt));
        stretch.set(1 + Math.min(0.2, Math.hypot(vel.current.x, vel.current.y) / 1700));

        const lookX = px.get() + vel.current.x * 0.1;
        const lookY = py.get() + vel.current.y * 0.1;
        const follow = 1 - Math.exp(-5.4 * dt);
        cam.current.x += (lookX * 0.7 - cam.current.x) * follow;
        cam.current.y += (lookY * 0.58 - cam.current.y) * follow;
        camX.set(cam.current.x);
        camY.set(cam.current.y);

        const sample: Sample = {
          t: now,
          x: px.get() - cam.current.x,
          y: py.get() - cam.current.y,
          r: rot.get(),
        };
        history.current.push(sample);
        if (history.current.length > 28) history.current.shift();
        const a = at(now, 28, sample);
        const b = at(now, 56, sample);
        const ghost = Math.min(0.34, Math.hypot(vel.current.x, vel.current.y) / 2400);
        g1x.set(a.x);
        g1y.set(a.y);
        g1r.set(a.r);
        g1o.set(ghost);
        g2x.set(b.x);
        g2y.set(b.y);
        g2r.set(b.r);
        g2o.set(ghost * 0.45);
      }

      if (field && !stunned) {
        const r = field.getBoundingClientRect();
        const planeX = 50 + (px.get() / Math.max(1, r.width)) * 100;
        const planeY = 50 + (py.get() / Math.max(1, r.height)) * 100;
        for (const c of cloudsRef.current) {
          if (c.wake !== "boom" || now < cooldownUntil.current) continue;
          const cx = c.x + c.w / 2;
          const cy = c.y + 10;
          const dx = ((planeX - cx) / 100) * r.width;
          const dy = ((planeY - cy) / 100) * r.height;
          if (Math.hypot(dx, dy) < 48) {
            cooldownUntil.current = now + 700;
            stunnedUntil.current = now + 110;
            sfxThunder();
            navigator.vibrate?.([20, 40, 20]);
            markScorch();
            setProgress((v) => Math.max(8, v - (3 + Math.random() * 2)));
            setHitLine(HIT_COPY[Math.random() < 0.5 ? 0 : 1]!);
            window.setTimeout(() => setHitLine(""), 1600);
            vel.current.x += Math.random() * 420 - 210;
            vel.current.y += 280;
            vel.current.r = 520;
            void animate(punch, 8, { duration: 0.05 }).then(() => animate(punch, 0, spring.snap));
          }
        }
        for (const lamp of lampsRef.current) {
          if (lamp.taken) continue;
          const dx = ((planeX - lamp.x) / 100) * r.width;
          const dy = ((planeY - lamp.y) / 100) * r.height;
          if (Math.hypot(dx, dy) < 36) {
            lamp.taken = true;
            setLamps((ls) => ls.map((l) => (l.id === lamp.id ? { ...l, taken: true } : l)));
            sfxCharge();
            setProgress((v) => Math.min(88, v + 5));
            setHitLine(LAMP_COPY[lamp.id % LAMP_COPY.length]!);
            window.setTimeout(() => setHitLine(""), 1400);
          }
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    const probe = {
      getX: () => px.get(),
      getY: () => py.get(),
      getVx: () => vel.current.x,
      getVy: () => vel.current.y,
      getBank: () => rot.get(),
      setTarget: (x: number, y: number) => {
        target.current.x = x;
        target.current.y = y;
      },
    };
    (window as Window & { __flightTest?: typeof probe }).__flightTest = probe;
    return () => {
      window.cancelAnimationFrame(raf);
      delete (window as Window & { __flightTest?: typeof probe }).__flightTest;
    };
  }, [reduce, ready, markScorch, px, py, rot, punch, camX, camY, stretch, g1x, g1y, g1r, g1o, g2x, g2y, g2r, g2o]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (ready || reduce) return;
      const field = fieldRef.current;
      if (!field) return;
      const r = field.getBoundingClientRect();
      target.current.x = Math.max(-r.width * 0.42, Math.min(r.width * 0.42, e.clientX - (r.left + r.width / 2)));
      target.current.y = Math.max(-r.height * 0.4, Math.min(r.height * 0.4, e.clientY - (r.top + r.height / 2)));
    }
    window.addEventListener("pointermove", onMove, { capture: true });
    return () => window.removeEventListener("pointermove", onMove, { capture: true });
  }, [ready, reduce]);

  const title = ready
    ? echo
      ? `穿过来了。${echo.city} 在下面。`
      : note || "到了"
    : "夜很长，手可以带着飞";
  const body = ready
    ? echo
      ? `${echo.city}。把飞机往下拉，落到桌上。`
      : note
    : hitLine || "飞机跟着你。灯是别人的窗，亮着的云要绕开。";

  return (
    <motion.div
      className="relative flex flex-1 flex-col items-center justify-between overflow-hidden px-4 py-6"
      style={{ y: punch }}
    >
      <Guide tone="night" title={title} body={body} />

      <div
        ref={fieldRef}
        data-flight-sky
        className="relative flex min-h-0 w-full flex-1 touch-none items-center justify-center overflow-hidden"
        onPointerDown={() => unlockAudio()}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ x: farX, y: farY }}
        >
          {FAR_CLOUDS.map((c, i) => (
            <div
              key={`far-${i}`}
              className="clay-cloud absolute rounded-[46%] opacity-45"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: `${c.w}%`,
                height: Math.max(28, c.w * 0.38),
              }}
            />
          ))}
        </motion.div>

        <motion.div className="pointer-events-none absolute inset-0" style={{ x: worldX, y: worldY }}>
          <div className="absolute inset-x-[-12%] bottom-[-28%] h-[46%] rounded-[50%] bg-paper/20" />

          {clouds.map((c, i) => (
            <motion.div
              key={c.id}
              className="clay-cloud absolute rounded-[46%]"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: `${c.w}%`,
                height: Math.max(36, c.w * 0.42),
                zIndex: 1,
              }}
              animate={
                ready
                  ? { x: i % 2 === 0 ? "-70%" : "70%", opacity: 0 }
                  : reduce
                    ? { opacity: 0.7 }
                    : {
                        x: ["0%", i % 2 ? "-10%" : "12%", "0%"],
                        scale: c.wake === "warn" ? 1.06 : c.wake === "boom" ? 1.12 : 1,
                      }
              }
              transition={
                ready
                  ? { duration: 0.85, ease: ease.exit }
                  : { duration: 11 + i, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <div
                className="absolute inset-[18%] rounded-[46%]"
                style={{
                  background:
                    c.wake === "boom"
                      ? "color-mix(in oklab, var(--color-sun) 70%, var(--color-paper))"
                      : c.wake === "warn"
                        ? "color-mix(in oklab, var(--color-paper) 40%, var(--color-sun))"
                        : "transparent",
                  opacity: c.wake === "idle" ? 0 : 1,
                }}
              />
            </motion.div>
          ))}

          {lamps.map((lamp) => (
            <motion.div
              key={lamp.id}
              className="clay-window absolute z-[2]"
              style={{
                left: `${lamp.x}%`,
                top: `${lamp.y}%`,
                width: lamp.taken ? 18 : 12,
                height: lamp.taken ? 22 : 16,
                background: lamp.color,
              }}
              animate={{
                opacity: ready && lamp.taken ? 1 : lamp.taken ? 1 : [0.55, 0.95, 0.55],
                scale: lamp.taken ? 1.15 : 1,
              }}
              transition={lamp.taken ? spring.tick : { duration: 2.4 + lamp.id, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </motion.div>

        {ready ? (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[64%] h-28 w-28 -translate-x-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 0.7, scale: 1.2 }}
            transition={spring.parent}
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--color-sun) 60%, transparent) 0%, transparent 70%)",
            }}
          />
        ) : null}

        {flash ? <div className="pointer-events-none absolute inset-0 z-[3] bg-paper/25" /> : null}

        {!ready && !reduce ? (
          <>
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-20 w-40"
              style={{ x: g2x, y: g2y, rotate: g2r, opacity: g2o, marginLeft: -80, marginTop: -40 }}
            >
              <Plane className="h-full w-full" />
            </motion.div>
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-20 w-40"
              style={{ x: g1x, y: g1y, rotate: g1r, opacity: g1o, marginLeft: -80, marginTop: -40 }}
            >
              <Plane className="h-full w-full" />
            </motion.div>
          </>
        ) : null}

        {ready ? (
          <PullCommit
            testId="flight"
            enabled
            sign={1}
            threshold={48}
            hint="松开，落到桌上"
            commitBehavior="morph"
            onCommit={arrive}
            className="relative z-[4]"
          >
            <Craft className="h-20 w-40">
              <Plane className="h-full w-full" scorched={scorch} />
            </Craft>
          </PullCommit>
        ) : (
          <motion.div
            layoutId={CRAFT_ID}
            data-craft=""
            className="absolute left-1/2 top-1/2 z-[4] h-20 w-40 will-change-transform"
            style={{ x: visX, y: visY, rotate: rot, scaleX: stretch, scaleY, marginLeft: -80, marginTop: -40 }}
          >
            <span className="plane-trail" />
            <Plane className="h-full w-full" scorched={scorch} />
          </motion.div>
        )}
      </div>

      <div className="relative mt-auto w-52 pb-4">
        <div className="h-0.5 overflow-hidden rounded-full bg-paper/20">
          <motion.div
            data-flight-progress
            className="h-full origin-left bg-coral"
            initial={false}
            animate={{ scaleX: ready ? 1 : Math.min(0.88, progress / 100) }}
            transition={ready ? spring.parent : { duration: 0.2, ease: "linear" }}
          />
        </div>
        <motion.p
          key={hitLine || (echo ? `${echo.name}-${echo.city}` : note)}
          className="mt-3 text-center text-xs text-paper/70"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.enter, ease: ease.enter }}
        >
          {ready ? "往下拉，落到桌上" : hitLine || (echo ? `${echo.name} · ${echo.city}` : note)}
        </motion.p>
      </div>
    </motion.div>
  );
}
