let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let pad: OscillatorNode | null = null;
let padGain: GainNode | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === "suspended") void c.resume();
}

/** 静音是纯副作用：只落音量，不存状态。真相在 store 的 muted。 */
export function setMuted(next: boolean) {
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 0.22, ctx.currentTime, 0.03);
  }
}

/** 页面切走后整体静音：冻结整个音频图，回来再解冻。 */
export function suspendAudio() {
  if (ctx && ctx.state === "running") void ctx.suspend();
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.08, slide = 0) {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

export function sfxPickup() {
  beep(420, 0.09, "triangle", 0.05, 80);
}
export function sfxDrop() {
  beep(280, 0.12, "sine", 0.04, -60);
}
export function sfxFold() {
  beep(180, 0.16, "square", 0.03, 40);
  beep(620, 0.08, "triangle", 0.02, -120);
}
export function sfxThrow() {
  beep(160, 0.14, "sine", 0.07, -50);
  beep(240, 0.42, "sawtooth", 0.045, 520);
  beep(1480, 0.07, "square", 0.018, -700);
}
export function sfxWhoosh() {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(90, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.8);
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.8);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.85);
  o.connect(f);
  f.connect(g);
  g.connect(master);
  o.start();
  o.stop(c.currentTime + 0.9);
}
export function sfxCharge() {
  beep(620, 0.07, "triangle", 0.035, 140);
  beep(880, 0.09, "sine", 0.02, 60);
}
export function sfxSnap() {
  beep(260, 0.11, "sine", 0.035, -90);
}
export function sfxMatch() {
  beep(523, 0.18, "sine", 0.06);
  setTimeout(() => beep(659, 0.22, "sine", 0.05), 90);
  setTimeout(() => beep(784, 0.28, "triangle", 0.04), 180);
}
export function sfxPaper() {
  beep(1400, 0.04, "square", 0.015, -400);
}
export function sfxBloom() {
  beep(740, 0.07, "square", 0.02, 80);
  beep(980, 0.09, "triangle", 0.016, -40);
}

export function startPad() {
  const c = ac();
  if (!c || !master || pad) return;
  pad = c.createOscillator();
  const o2 = c.createOscillator();
  padGain = c.createGain();
  pad.type = "sine";
  o2.type = "triangle";
  pad.frequency.value = 110;
  o2.frequency.value = 164.8;
  padGain.gain.value = 0.0001;
  pad.connect(padGain);
  o2.connect(padGain);
  padGain.connect(master);
  pad.start();
  o2.start();
  padGain.gain.setTargetAtTime(0.03, c.currentTime, 0.4);
}

export function stopPad() {
  if (!ctx || !padGain) return;
  padGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
}
