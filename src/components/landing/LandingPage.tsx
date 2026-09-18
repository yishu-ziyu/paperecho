import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "@tanstack/react-router";
import {
  Feather,
  Compass,
  Moon,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ArrowRight,
  Sparkles,
  MapPin,
  Clock,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

// --- Constellation & Starry Night Data ---
const STARS = [
  { left: "8%", top: "12%", size: 3, opacity: 0.8, delay: 0 },
  { left: "18%", top: "25%", size: 2, opacity: 0.6, delay: 1.2 },
  { left: "28%", top: "15%", size: 2.5, opacity: 0.9, delay: 0.4 },
  { left: "42%", top: "8%", size: 3, opacity: 0.7, delay: 2.1 },
  { left: "62%", top: "18%", size: 2, opacity: 0.5, delay: 1.5 },
  { left: "75%", top: "11%", size: 3.5, opacity: 0.85, delay: 0.7 },
  { left: "88%", top: "22%", size: 2, opacity: 0.6, delay: 1.8 },
  { left: "93%", top: "14%", size: 2.5, opacity: 0.9, delay: 0.2 },
  { left: "14%", top: "68%", size: 2, opacity: 0.5, delay: 2.4 },
  { left: "32%", top: "82%", size: 3, opacity: 0.75, delay: 1.1 },
  { left: "68%", top: "75%", size: 2, opacity: 0.6, delay: 0.9 },
  { left: "84%", top: "65%", size: 3, opacity: 0.8, delay: 1.7 },
];

const PRESET_THOUGHTS = [
  "投了三十多份简历，在客厅坐到现在。",
  "群里只回了收到，夜里雨还没停。",
  "原来三千公里外，也有人没睡。",
  "三十岁的第一天，好像和昨天没什么两样。",
];

const ECHO_STORIES = [
  {
    id: 1,
    originCity: "北京",
    originTime: "02:14",
    thought: "转正答辩没过，在天桥吹了半小时风。看着下面车流，不知道这几年在忙什么。",
    echoCity: "成都",
    echoTime: "02:38",
    echo: "天桥风大，早点回屋煮碗热面吧。我也刚换了赛道，一切才刚开始。夜里有我陪着你呢。",
    stampColor: "#d4785a",
  },
  {
    id: 2,
    originCity: "芝加哥",
    originTime: "03:45",
    thought: "赶完最后一个 deadline，推开窗突然下大雪了。整栋楼只剩我一间亮着灯。",
    echoCity: "深圳",
    echoTime: "17:45",
    echo: "你那里下雪了吗？我这边正赶上下班晚霞。隔着十二个时区，敬你这一杯热咖啡，快去睡个好觉。",
    stampColor: "#6ba8a0",
  },
  {
    id: 3,
    originCity: "杭州",
    originTime: "01:20",
    thought: "家里催婚电话挂断后，屋里好安静。按他们说的走，真的会更快乐吗？",
    echoCity: "墨尔本",
    echoTime: "04:20",
    echo: "安静也是一种自由。今夜只属于你自己，不用向任何人的期待交代。祝你有好梦。",
    stampColor: "#e8c56b",
  },
  {
    id: 4,
    originCity: "南京",
    originTime: "00:48",
    thought: "三十岁的第一天，好像和昨天没什么两样。没有大彻大悟，也没有奇迹。",
    echoCity: "台北",
    echoTime: "00:52",
    echo: "没有惊涛骇浪，平安普通地又长了一岁，本身就是很了不起的幸运。生日快乐！",
    stampColor: "#7a9a68",
  },
];

const FILM_ACTS = [
  {
    act: "Act I",
    title: "素纸落墨",
    desc: "台灯昏黄，白纸微皱。输入一句白天没处说的心事，墨水顺着光纤悄悄渗透纸纤维。",
    visualNote: "Macro · 纸面微距 · 钢笔墨色渐显",
    palette: "bg-[#162035]",
  },
  {
    act: "Act II",
    title: "对角翻折",
    desc: "指尖划过中轴，纸张清脆翻折。物理阻尼刚度，让虚无的字句拥有真实的重量。",
    visualNote: "Applecut · 实体折痕 · 刚度形变",
    palette: "bg-[#18243b]",
  },
  {
    act: "Act III",
    title: "夜航经纬",
    desc: "纸飞机滑出窗棂，升入深蓝夜空。无数金黄微光，在各大洲未眠的坐标间悄声穿梭。",
    visualNote: "Nightflight · 地球仪夜航 · 经纬轨迹",
    palette: "bg-[#101726]",
  },
  {
    act: "Act IV",
    title: "暗格降落",
    desc: "飞机轻轻降落在三千公里外另一张木桌上，被悄悄收进暗格。清晨推窗，回声已在手中。",
    visualNote: "Dawn · 木质暗格 · 墨迹温存",
    palette: "bg-[#1e2a45]",
  },
];

export function LandingPage() {
  const [soundActive, setSoundActive] = useState(false);
  const [inputText, setInputText] = useState("投了三十多份简历，在客厅坐到现在。");
  const [foldStage, setFoldStage] = useState(0); // 0: unfolded, 1: creased, 2: folded wings, 3: launched
  const [activeStory, setActiveStory] = useState(0);
  const [currentAct, setCurrentAct] = useState(0);
  const [filmPlaying, setFilmPlaying] = useState(true);

  // Auto-advance film showcase acts
  useEffect(() => {
    if (!filmPlaying) return;
    const timer = setInterval(() => {
      setCurrentAct((prev) => (prev + 1) % FILM_ACTS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [filmPlaying]);

  const handleLaunch = () => {
    setFoldStage(1);
    setTimeout(() => setFoldStage(2), 500);
    setTimeout(() => setFoldStage(3), 1100);
  };

  const handleResetFold = () => {
    setFoldStage(0);
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#101726] text-[#f0e6d2] selection:bg-[#d4785a] selection:text-white font-sans">
      {/* Background Starry Sky & Moonlit Gradient */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(35, 55, 95, 0.6) 0%, rgba(16, 23, 38, 0.95) 75%, #101726 100%)",
          }}
        />
        {/* Constellation Stars */}
        {STARS.map((s, idx) => (
          <span
            key={idx}
            className="absolute rounded-full bg-[#f4efe4]"
            style={{
              left: s.left,
              top: s.top,
              width: `${s.size}px`,
              height: `${s.size}px`,
              opacity: s.opacity,
              boxShadow: `0 0 ${s.size * 3}px rgba(240, 230, 210, 0.8)`,
              animation: `pulse 3.5s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
        {/* Soft Ambient Horizon Glow */}
        <div className="absolute -bottom-48 left-1/2 h-[450px] w-[800px] -translate-x-1/2 rounded-full bg-[#d4785a]/10 blur-[130px]" />
      </div>

      {/* --- Top Navigation --- */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-8">
        <Link to="/" className="group flex items-center gap-3 transition-transform hover:scale-[1.02]">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0e6d2] shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-transform group-hover:rotate-[-6deg]">
            {/* Origami Paper Plane Icon */}
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-[#1a2744]">
              <path d="M2.5 12L21 3L14 21L11.5 14.5L2.5 12Z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="font-display block text-lg font-bold tracking-tight text-[#f4efe4]">纸上的回声</span>
            <span className="block text-[11px] tracking-widest text-[#f0e6d2]/50 uppercase">PaperEcho</span>
          </div>
        </Link>

        {/* Anchor Links */}
        <nav className="hidden items-center gap-7 text-sm text-[#f0e6d2]/70 md:flex">
          <a href="#craft" className="transition-colors hover:text-[#f4efe4]">
            纸墨材质
          </a>
          <a href="#echoes" className="transition-colors hover:text-[#f4efe4]">
            回声标本
          </a>
          <a href="#film" className="transition-colors hover:text-[#f4efe4]">
            概念短片
          </a>
          <a href="#philosophy" className="transition-colors hover:text-[#f4efe4]">
            设计宣言
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundActive(!soundActive)}
            title={soundActive ? "静音环境音" : "开启夜风环境声"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#f0e6d2]/20 bg-[#162238]/60 text-[#f0e6d2]/80 transition-colors hover:border-[#f0e6d2]/40 hover:text-white"
          >
            {soundActive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          <Link
            to="/"
            className="group flex items-center gap-1.5 rounded-full bg-[#f0e6d2] px-5 py-2 text-sm font-semibold text-[#1a2744] shadow-[0_3px_10px_rgba(240,230,210,0.18)] transition-all hover:bg-[#fff9ee] hover:shadow-[0_4px_16px_rgba(240,230,210,0.3)] active:translate-y-0.5"
          >
            <span>推开窗 · 进房间</span>
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {/* --- HERO SECTION --- */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-20 sm:px-8 sm:pt-16 md:pt-20">
        <div className="flex flex-col items-center text-center">
          {/* Subtle badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4785a]/40 bg-[#d4785a]/10 px-4 py-1.5 text-xs text-[#d4785a] backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            <span>深夜慢速投递 · 真实物理触感的情绪纸飞机</span>
          </div>

          {/* Main Title */}
          <h1 className="font-display mt-6 max-w-4xl text-3xl font-extrabold tracking-tight text-[#f4efe4] sm:text-5xl md:text-6xl md:leading-[1.15]">
            三千公里的夜色里，
            <br />
            <span className="bg-gradient-to-r from-[#f0e6d2] via-[#f7d6a5] to-[#d4785a] bg-clip-text text-transparent">
              只落在懂你的一扇窗前。
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#f0e6d2]/75 sm:text-lg">
            没有算法推荐，没有公开点赞。把深夜说不出口的心情，亲手折成一架有重量的纸飞机，投进真实经纬线的夜风里，等一个同样未眠人的回音。
          </p>

          {/* --- Interactive Origami Stage (Hero Prototype) --- */}
          <div className="relative mt-12 w-full max-w-2xl">
            <div className="relative overflow-hidden rounded-3xl border border-[#f0e6d2]/20 bg-[#162035]/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
              {/* Top status & city indicator */}
              <div className="flex items-center justify-between border-b border-[#f0e6d2]/10 pb-4 text-xs text-[#f0e6d2]/60">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-ping rounded-full bg-[#7a9a68]" />
                  <span>此时此刻 · 线上正有 1,420 架纸飞机在夜空巡航</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>深夜 02:40</span>
                </div>
              </div>

              {/* Central Foldable Paper Sheet Canvas */}
              <div className="relative my-6 flex min-h-[220px] flex-col justify-between rounded-2xl bg-[#f4efe4] p-6 text-[#1a2744] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),0_12px_28px_rgba(0,0,0,0.25)] transition-all duration-500">
                {/* Visual Crease Line */}
                <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[#1a2744]/15" />
                <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-[#1a2744]/15" />

                <AnimatePresence mode="wait">
                  {foldStage === 0 && (
                    <motion.div
                      key="unfolded"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-1 flex-col justify-between"
                    >
                      <div className="text-left">
                        <div className="flex items-center justify-between text-xs tracking-wider text-[#1a2744]/50">
                          <span className="font-mono">NO. 2026-PE · 纸上的信笺</span>
                          <span className="italic">手不换这张纸</span>
                        </div>
                        <div className="mt-3 font-serif text-lg text-[#1a2744] sm:text-xl">
                          <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="写下一句今晚没处说的心事..."
                            rows={3}
                            className="w-full resize-none border-none bg-transparent p-0 text-base leading-relaxed text-[#1a2744] placeholder-[#1a2744]/40 focus:outline-none focus:ring-0 sm:text-lg"
                          />
                        </div>
                      </div>

                      {/* Pill suggestions */}
                      <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 text-left">
                        <span className="text-xs text-[#1a2744]/60">换一句试试：</span>
                        {PRESET_THOUGHTS.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => setInputText(t)}
                            className="rounded-full border border-[#1a2744]/15 bg-white/60 px-2.5 py-1 text-xs text-[#1a2744] transition-colors hover:bg-white hover:border-[#1a2744]/30"
                          >
                            {t.slice(0, 10)}...
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {foldStage === 1 && (
                    <motion.div
                      key="creased"
                      initial={{ rotateX: -20, opacity: 0 }}
                      animate={{ rotateX: 0, opacity: 1 }}
                      exit={{ rotateX: 30, opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className="flex flex-1 flex-col items-center justify-center text-center"
                    >
                      <div className="h-16 w-16 rotate-45 rounded-lg border-2 border-[#1a2744]/30 bg-[#ebdcc2] shadow-inner" />
                      <p className="mt-4 font-serif text-sm font-semibold tracking-wider text-[#1a2744]/80">
                        正在沿中轴对齐折叠…
                      </p>
                    </motion.div>
                  )}

                  {foldStage === 2 && (
                    <motion.div
                      key="folded"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 1.1, opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className="flex flex-1 flex-col items-center justify-center text-center"
                    >
                      <div className="relative flex h-20 w-24 items-center justify-center">
                        <svg viewBox="0 0 100 80" className="h-20 w-24 drop-shadow-[0_6px_12px_rgba(26,39,68,0.25)]">
                          <polygon points="50,5 95,75 50,60" fill="#ebd8bc" />
                          <polygon points="50,5 5,75 50,60" fill="#f4efe4" />
                          <polygon points="50,60 50,75 42,70" fill="#c3b394" />
                        </svg>
                      </div>
                      <p className="mt-3 font-serif text-sm font-semibold text-[#1a2744]">
                        机翼成型 · 纸飞机准备滑入夜风
                      </p>
                    </motion.div>
                  )}

                  {foldStage === 3 && (
                    <motion.div
                      key="launched"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="relative flex flex-1 flex-col items-center justify-center py-4 text-center"
                    >
                      {/* Airplane flying away animation */}
                      <motion.div
                        animate={{
                          x: [0, 140, 280],
                          y: [0, -40, -120],
                          scale: [1, 0.85, 0.4],
                          opacity: [1, 0.9, 0],
                        }}
                        transition={{ duration: 1.8, ease: "easeOut" }}
                        className="absolute"
                      >
                        <svg viewBox="0 0 24 24" className="h-12 w-12 fill-[#d4785a]">
                          <path d="M2.5 12L21 3L14 21L11.5 14.5L2.5 12Z" />
                        </svg>
                      </motion.div>

                      <div className="z-10 rounded-xl bg-white/85 p-4 shadow-sm backdrop-blur-sm">
                        <CheckCircle2 className="mx-auto h-7 w-7 text-[#7a9a68]" />
                        <h4 className="mt-2 font-display text-base font-bold text-[#1a2744]">
                          已乘着夜风投出！
                        </h4>
                        <p className="mt-1 text-xs text-[#1a2744]/75">
                          预计飞行三千公里 · 正在寻觅同频未眠的窗口
                        </p>
                        <button
                          onClick={handleResetFold}
                          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#d4785a] hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>再折一架试试</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Interactive Controls */}
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-2 text-xs text-[#f0e6d2]/70">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#d4785a]" />
                  <span>支持手势对角折纸 · 真实阻尼物理反馈</span>
                </div>

                <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                  {foldStage === 0 ? (
                    <button
                      onClick={handleLaunch}
                      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#d4785a] px-6 py-3 text-sm font-bold text-white shadow-[0_4px_16px_rgba(212,120,90,0.4)] transition-all hover:bg-[#e08466] hover:shadow-[0_6px_20px_rgba(212,120,90,0.55)] active:translate-y-0.5 sm:w-auto"
                    >
                      <Feather className="h-4 w-4" />
                      <span>折成纸飞机并掷出</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  ) : (
                    <button
                      onClick={handleResetFold}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#f0e6d2]/25 bg-transparent px-4 py-2.5 text-xs text-[#f0e6d2] transition-colors hover:bg-white/5 sm:w-auto"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>展开信纸</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 2: MOTION & CRAFT ("手不换这张纸") --- */}
      <section id="craft" className="relative z-10 border-t border-[#f0e6d2]/10 bg-[#141d30] py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <div className="text-center">
            <span className="font-mono text-xs tracking-widest text-[#d4785a] uppercase">Physical Handfeel & Motion</span>
            <h2 className="font-display mt-2 text-3xl font-extrabold tracking-tight text-[#f4efe4] sm:text-4xl">
              手不换这张纸 · 动效即材质
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-[#f0e6d2]/70">
              拒绝塑料质感的网页弹窗。每一次折痕、每一次阻尼、每一次起落，都是同一张有质感、有记忆的信纸在呼吸。
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Card 1 */}
            <div className="group relative rounded-3xl border border-[#f0e6d2]/15 bg-[#1a2744]/80 p-8 shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:border-[#f0e6d2]/35 hover:shadow-[0_16px_36px_rgba(0,0,0,0.4)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0e6d2] text-[#1a2744] shadow-md">
                <Feather className="h-6 w-6" />
              </div>
              <h3 className="font-display mt-6 text-xl font-bold text-[#f4efe4]">连续材质形变</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#f0e6d2]/70">
                写字、压折痕、翼面隆起、掠过窗台——全链路在同一视口内单张纸连续插值。关掉动效，静帧也是一幅构图完美的实体标本。
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#d4785a]">
                <span>基于物理弹簧阻尼解算</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="group relative rounded-3xl border border-[#f0e6d2]/15 bg-[#1a2744]/80 p-8 shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:border-[#f0e6d2]/35 hover:shadow-[0_16px_36px_rgba(0,0,0,0.4)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d4785a] text-white shadow-md">
                <Compass className="h-6 w-6" />
              </div>
              <h3 className="font-display mt-6 text-xl font-bold text-[#f4efe4]">真实经纬巡航</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#f0e6d2]/70">
                信件不进公网社交信息流。在低轨经纬线地球仪上，纸飞机跟随风向穿梭于各大城市经纬坐标，只在真正懂得的窗口降落。
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#d4785a]">
                <span>Cobe WebGL2 极轻微夜航</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="group relative rounded-3xl border border-[#f0e6d2]/15 bg-[#1a2744]/80 p-8 shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:border-[#f0e6d2]/35 hover:shadow-[0_16px_36px_rgba(0,0,0,0.4)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7a9a68] text-white shadow-md">
                <Moon className="h-6 w-6" />
              </div>
              <h3 className="font-display mt-6 text-xl font-bold text-[#f4efe4]">安静暗格收信</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#f0e6d2]/70">
                绝无弹窗与红点催促。收到的回信会静静躺在书桌底层的抽屉暗格里。深夜推开窗，拾起一封多年前或今晚刚好落下的回音。
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#7a9a68]">
                <span>脱离即使反馈焦虑的慢交流</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 3: ECHO WALL (回声标本墙 · 真实故事对谈) --- */}
      <section id="echoes" className="relative z-10 py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <span className="font-mono text-xs tracking-widest text-[#d4785a] uppercase">Specimen & Resonance</span>
              <h2 className="font-display mt-2 text-3xl font-extrabold tracking-tight text-[#f4efe4] sm:text-4xl">
                今夜被拾起的回声标本
              </h2>
              <p className="mt-3 max-w-xl text-sm text-[#f0e6d2]/70">
                每一封都是来自真实未眠人的笔触。点击任意一张便签，翻阅深夜跨越山海的信件。
              </p>
            </div>

            {/* Story Picker Tabs */}
            <div className="flex gap-2">
              {ECHO_STORIES.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setActiveStory(idx)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeStory === idx
                      ? "bg-[#f0e6d2] text-[#1a2744] shadow-md"
                      : "border border-[#f0e6d2]/20 bg-white/5 text-[#f0e6d2]/60 hover:text-white"
                  }`}
                >
                  {s.originCity} ↔ {s.echoCity}
                </button>
              ))}
            </div>
          </div>

          {/* Large Interactive Story Display */}
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Origin Note */}
            <motion.div
              key={`origin-${activeStory}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="relative flex min-h-[260px] flex-col justify-between rounded-3xl bg-[#f4efe4] p-8 text-[#1a2744] shadow-[0_12px_36px_rgba(0,0,0,0.3)]"
            >
              <div className="flex items-center justify-between border-b border-[#1a2744]/10 pb-4 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#d4785a]">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{ECHO_STORIES[activeStory].originCity}</span>
                </div>
                <div className="flex items-center gap-1 text-[#1a2744]/50">
                  <Clock className="h-3 w-3" />
                  <span>{ECHO_STORIES[activeStory].originTime} 发出</span>
                </div>
              </div>

              <div className="my-6">
                <p className="font-serif text-lg leading-relaxed text-[#1c1914] sm:text-xl">
                  “{ECHO_STORIES[activeStory].thought}”
                </p>
              </div>

              <div className="flex items-center justify-between text-xs text-[#1a2744]/50">
                <span>压在箱底的原始心声</span>
                <span className="font-mono">已折入纸飞机</span>
              </div>
            </motion.div>

            {/* Echo Received Note */}
            <motion.div
              key={`echo-${activeStory}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="relative flex min-h-[260px] flex-col justify-between rounded-3xl border border-[#7a9a68]/40 bg-[#16292b] p-8 text-[#f0e6d2] shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-[#f0e6d2]/15 pb-4 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#7a9a68]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>来自 {ECHO_STORIES[activeStory].echoCity} 的回声</span>
                </div>
                <div className="flex items-center gap-1 text-[#f0e6d2]/60">
                  <Clock className="h-3 w-3" />
                  <span>{ECHO_STORIES[activeStory].echoTime} 回信</span>
                </div>
              </div>

              <div className="my-6">
                <p className="font-serif text-lg leading-relaxed text-[#f4efe4] sm:text-xl">
                  “{ECHO_STORIES[activeStory].echo}”
                </p>
              </div>

              <div className="flex items-center justify-between text-xs text-[#f0e6d2]/50">
                <span>从暗格中展开的便签</span>
                <span className="font-mono text-[#7a9a68]">✓ 两人房间已封存</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* --- SECTION 4: CINEMATIC SHOWCASE (概念短片展台) --- */}
      <section id="film" className="relative z-10 border-t border-[#f0e6d2]/10 bg-[#0d1320] py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <span className="font-mono text-xs tracking-widest text-[#d4785a] uppercase">Cinematic Experience</span>
              <h2 className="font-display mt-2 text-3xl font-extrabold tracking-tight text-[#f4efe4] sm:text-4xl">
                30 秒概念片 · 纸飞机的夜航
              </h2>
              <p className="mt-3 max-w-xl text-sm text-[#f0e6d2]/70">
                遵循 Applecut 纯净镜头哲学。一镜一事，聚焦实体折纸与暗夜飞行。
              </p>
            </div>

            {/* Play/Pause Toggle */}
            <button
              onClick={() => setFilmPlaying(!filmPlaying)}
              className="flex items-center gap-2 rounded-full border border-[#f0e6d2]/25 bg-white/5 px-4 py-2 text-xs font-semibold text-[#f0e6d2] transition-colors hover:bg-white/10"
            >
              {filmPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{filmPlaying ? "暂停分镜轮播" : "继续自动播放"}</span>
            </button>
          </div>

          {/* Film Showcase Window */}
          <div className="mt-10 overflow-hidden rounded-3xl border border-[#f0e6d2]/20 bg-[#162035] shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
            {/* 16:9 Screen Frame */}
            <div className="relative aspect-video w-full overflow-hidden sm:aspect-[21/9]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentAct}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.7, ease: "easeInOut" }}
                  className={`absolute inset-0 flex flex-col items-center justify-center p-8 text-center ${FILM_ACTS[currentAct].palette}`}
                >
                  {/* Subtle noise and light ring */}
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(240,230,210,0.08)_0%,transparent_70%)]" />

                  <span className="rounded-full border border-[#f0e6d2]/20 bg-black/40 px-3 py-1 font-mono text-xs text-[#d4785a] uppercase">
                    {FILM_ACTS[currentAct].act} · {FILM_ACTS[currentAct].visualNote}
                  </span>

                  <h3 className="font-display mt-4 text-2xl font-bold text-[#f4efe4] sm:text-4xl">
                    {FILM_ACTS[currentAct].title}
                  </h3>

                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#f0e6d2]/80 sm:text-base">
                    {FILM_ACTS[currentAct].desc}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Act Step Tabs */}
            <div className="grid grid-cols-2 divide-x divide-[#f0e6d2]/10 border-t border-[#f0e6d2]/10 bg-[#121a2c] sm:grid-cols-4">
              {FILM_ACTS.map((act, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentAct(idx);
                    setFilmPlaying(false);
                  }}
                  className={`relative p-4 text-left transition-all ${
                    currentAct === idx ? "bg-white/5" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {currentAct === idx && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-[#d4785a]" />
                  )}
                  <span className="block font-mono text-[11px] text-[#f0e6d2]/50">{act.act}</span>
                  <span className="font-display mt-0.5 block text-sm font-semibold text-[#f4efe4]">{act.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 5: PHILOSOPHY & MANIFESTO --- */}
      <section id="philosophy" className="relative z-10 py-24">
        <div className="mx-auto max-w-4xl px-6 text-center sm:px-8">
          <span className="font-mono text-xs tracking-widest text-[#d4785a] uppercase">Design Manifesto</span>
          <h2 className="font-display mt-2 text-3xl font-extrabold tracking-tight text-[#f4efe4] sm:text-4xl">
            为什么是「纸上的回声」？
          </h2>

          <div className="mt-12 space-y-6 text-left">
            <div className="rounded-2xl border border-[#f0e6d2]/10 bg-[#162035]/60 p-6 sm:p-8">
              <h3 className="font-display text-lg font-bold text-[#f4efe4]">一、为什么不设点赞与公开评论？</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f0e6d2]/70">
                现代社交媒体把人的情绪量化为互动数据，催生了表演欲与被评价的焦虑。PaperEcho 不设点赞、不设排行榜。信件只由夜风吹向一扇随机而同频的窗，给倾诉最安全的保留地。
              </p>
            </div>

            <div className="rounded-2xl border border-[#f0e6d2]/10 bg-[#162035]/60 p-6 sm:p-8">
              <h3 className="font-display text-lg font-bold text-[#f4efe4]">二、为什么一定要用手折叠纸张？</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f0e6d2]/70">
                打字发送只需要 0.1 秒，而把一张信纸沿着对角线折平、抚平折痕、立起机翼，需要 5 秒钟的专注。这 5 秒的物理交互是情绪的沉淀——给冲动一次深呼吸的机会。
              </p>
            </div>

            <div className="rounded-2xl border border-[#f0e6d2]/10 bg-[#162035]/60 p-6 sm:p-8">
              <h3 className="font-display text-lg font-bold text-[#f4efe4]">三、为什么是漫长的夜航？</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f0e6d2]/70">
                即时通讯让人疲于奔命。PaperEcho 是一场慢速的守候。有时飞机飞过半个地球需要半小时，有时回声在天亮时才悄然抵达。慢下来，文字才有真正的温度。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 6: BOTTOM CTA & FOOTER --- */}
      <footer className="relative z-10 border-t border-[#f0e6d2]/10 bg-[#0d1320] pt-20 pb-12">
        <div className="mx-auto max-w-4xl px-6 text-center sm:px-8">
          <h2 className="font-display text-3xl font-extrabold text-[#f4efe4] sm:text-5xl">
            今夜的风刚刚好，
            <br />
            信纸已经为你铺开。
          </h2>
          <p className="mt-4 text-base text-[#f0e6d2]/70">
            免去烦琐的注册。推开窗，在信纸上写下第一句，让纸飞机飞入今晚的夜空。
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/"
              className="group flex items-center gap-2 rounded-2xl bg-[#f0e6d2] px-8 py-4 text-base font-bold text-[#1a2744] shadow-[0_6px_24px_rgba(240,230,210,0.25)] transition-all hover:bg-white hover:shadow-[0_8px_30px_rgba(240,230,210,0.4)] active:translate-y-0.5"
            >
              <span>推开窗 · 立即写一封信</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-[#f0e6d2]/10 pt-8 text-xs text-[#f0e6d2]/50 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-[#f0e6d2]/80">纸上的回声 PaperEcho</span>
              <span>© 2026</span>
            </div>
            <div className="flex gap-6">
              <Link to="/" className="hover:text-white">
                进入产品
              </Link>
              <a href="#craft" className="hover:text-white">
                手感设计
              </a>
              <a href="#film" className="hover:text-white">
                宣传片
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
