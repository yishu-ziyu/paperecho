import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  ArrowRight,
  Sparkles,
  Compass,
  Feather,
  Archive,
  ChevronRight,
  ChevronLeft,
  Film,
  Sliders,
  ShieldCheck,
} from "lucide-react";

// --- 8 步完整实机游玩流程（怎么玩、怎么用） ---
const WALKTHROUGH_STEPS = [
  {
    step: "01",
    title: "下拉门帘 · 潜入房间",
    subtitle: "克服物理阻尼，进入深夜书房",
    action: "手指在屏幕上方向下拉拽门帘卡片",
    result: "带有弹簧阻尼拉伸反馈，拉至临界点松手，直接落入案头书房场景",
    src: "/previews/01-title.png",
    tag: "入场手势",
  },
  {
    step: "02",
    title: "拾起情绪 · 写下今晚的事",
    subtitle: "选一块微粒，在信纸上落笔",
    action: "在环形轨道上拖拽一枚情绪微粒滑入中心，在信笺上写下一件今晚具体发生的事",
    result: "写下一件真实发生的日常（如方案改版、末班车、一个人煮面），不说教、不堆砌形容词",
    src: "/previews/02-orbit.png",
    tag: "信笺撰写",
  },
  {
    step: "03",
    title: "对角拉拽 · 折成纸飞机",
    subtitle: "告别点击按钮，亲手对折压痕",
    action: "手指沿信纸对角线拉拽两次纸角",
    result: "信纸根据手指拉拽受力产生物理形变阻力，拉满后清脆对折，成型为纸飞机机翼",
    src: "/previews/03-fold.png",
    tag: "物理折纸",
  },
  {
    step: "04",
    title: "转动地球 · 弹射出窗",
    subtitle: "对准经纬坐标，蓄力发射",
    action: "拨动 3D 点阵地球仪选定飞行经纬方向，向后拉拽纸飞机蓄满橡皮筋弹力后释放",
    result: "纸飞机冲出窗台，滑入浩瀚夜空",
    src: "/previews/04-throw.png",
    tag: "弹弓弹射",
  },
  {
    step: "05",
    title: "夜空巡航 · 经纬夜航",
    subtitle: "穿越云海，寻找深夜未眠人",
    action: "纸飞机在低轨夜云中巡航，系统按真实大圆航程计算飞行时差",
    result: "在平行世界中寻找一位也写下过类似生活经历的普通人",
    src: "/previews/05-flight.png",
    tag: "云海航程",
  },
  {
    step: "06",
    title: "案头对谈 · 交换生活事实",
    subtitle: "不说教、不安慰，只讲自己的日常",
    action: "飞机降落在目标案头，双方手写便签平行展开，玩家拖动卡片或写下自己的回复",
    result: "对方只聊他今晚的具体事，不安慰、不分析，用真实细节互相陪伴",
    src: "/previews/06-encounter.png",
    tag: "便签对谈",
  },
  {
    step: "07",
    title: "沿痕下拉 · 拆开回信",
    subtitle: "收到飞回来的纸飞机",
    action: "飞回来的纸飞机停在掌心，手指沿折痕向下拉开",
    result: "展开发信人留在纸背的最终回信与生活留白",
    src: "/previews/07-return.png",
    tag: "拆开回信",
  },
  {
    step: "08",
    title: "滑入抽屉 · 暗格封存",
    subtitle: "无红点骚扰，永久归档于信箱",
    action: "向下拉拽信件，推入案头底层的红陶抽屉",
    result: "信件收入个人信柜，没有公开榜单与点赞比拼，想重读时随时拉开抽屉即可",
    src: "/previews/08-archive.png",
    tag: "抽屉信柜",
  },
];

export function LandingPage() {
  const [activeWalkthrough, setActiveWalkthrough] = useState(0);
  const [isPlayingWalkthrough, setIsPlayingWalkthrough] = useState(false);
  const [activeVideo, setActiveVideo] = useState<"flight" | "room">("flight");
  const [soundMuted, setSoundMuted] = useState(true);

  // 自动播放演示 Walkthrough
  useEffect(() => {
    if (!isPlayingWalkthrough) return;
    const timer = setInterval(() => {
      setActiveWalkthrough((prev) => (prev + 1) % WALKTHROUGH_STEPS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [isPlayingWalkthrough]);

  const currentStep = WALKTHROUGH_STEPS[activeWalkthrough];

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#141d30] text-[#f0e6d2] font-sans selection:bg-[#d4785a] selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-[#f0e6d2]/15 bg-[#141d30]/90 px-6 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="clay-sm flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0e6d2] text-[#1a2744]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M2.5 12L21 3L14 21L11.5 14.5L2.5 12Z" />
              </svg>
            </div>
            <div>
              <span className="font-latin text-lg font-bold tracking-wide text-paper">PAPER ECHO</span>
              <span className="ml-2 text-xs text-paper/60">纸上的回声</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-xs font-semibold text-paper/75 lg:flex">
            <a href="#origin" className="transition-colors hover:text-paper">起源与初衷</a>
            <a href="#walkthrough" className="transition-colors hover:text-paper">怎么玩 · 流程演示</a>
            <a href="#cinematic-reel" className="transition-colors hover:text-paper">实机画面</a>
            <a href="#details" className="transition-colors hover:text-paper">设计细节</a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="https://yishuziyu.cn"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full border border-paper/20 px-3.5 py-1.5 text-xs text-paper/80 transition-colors hover:border-paper/40 hover:text-white md:inline-block"
            >
              奕枢工坊 ↗
            </a>
            <Link
              to="/"
              className="clay-sm group flex items-center gap-1.5 rounded-full bg-[#f0e6d2] px-4 py-1.5 text-xs font-bold text-[#1a2744] transition-transform active:translate-y-0.5"
            >
              <span>推开窗 · 进房间</span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* --- 1. HERO SECTION --- */}
      <section className="relative overflow-hidden border-b border-[#f0e6d2]/10 pt-12 pb-18">
        <div className="pointer-events-none absolute inset-0 z-0">
          <img
            src="/scenes/title.jpg"
            alt="Title Backdrop"
            className="h-full w-full object-cover opacity-20 filter blur-xl scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#141d30]/60 via-[#141d30]/90 to-[#141d30]" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            {/* Left Column: Product Statement */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d4785a]/40 bg-[#d4785a]/15 px-3.5 py-1 text-xs text-[#d4785a]">
                <Feather className="h-3.5 w-3.5" />
                <span>奕枢工坊 · 独立手作项目</span>
              </div>

              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-paper sm:text-5xl lg:text-6xl">
                <span className="type-clay block font-latin text-[clamp(2.8rem,7vw,4.8rem)] leading-[0.9]">
                  PAPER ECHO
                </span>
                <span className="font-display mt-2 block text-2xl font-bold tracking-widest text-[#f0e6d2] sm:text-3xl">
                  纸上的回声
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-paper/85 sm:text-lg">
                一款不提供廉价安慰的深夜案头信件应用。
                <br className="hidden sm:inline" />
                把一件具体发生的事写在纸上，折成飞机掷出。世界另一端的普通人只讲自己的平行经历，不说教，不安慰。
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/"
                  className="clay flex items-center gap-2 rounded-2xl bg-[#f0e6d2] px-6 py-3 text-sm font-bold text-[#1a2744] transition-all hover:bg-white active:translate-y-0.5"
                >
                  <Feather className="h-4 w-4 text-[#d4785a]" />
                  <span>推开窗 · 进入房间</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#walkthrough"
                  className="flex items-center gap-2 rounded-2xl border border-paper/20 bg-white/5 px-5 py-3 text-sm font-semibold text-paper/90 transition-colors hover:bg-white/10"
                >
                  <Play className="h-4 w-4 text-[#e8c56b]" />
                  <span>看完整玩法演示</span>
                </a>
              </div>

              {/* Product Fact Footer */}
              <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-paper/10 pt-5 text-xs text-paper/60">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#7a9a68]" />
                  <span>无点赞 · 无评论 · 无已读回执</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#d4785a]" />
                  <span>真实经纬大圆航程</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#e8c56b]" />
                  <span>连续弹簧阻尼手势</span>
                </div>
              </div>
            </div>

            {/* Right Column: Real 3D Title Screen */}
            <div className="relative lg:col-span-6">
              <div className="relative mx-auto max-w-md overflow-hidden rounded-3xl border border-paper/25 bg-[#1a2744] p-2 shadow-2xl">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black">
                  <img
                    src="/previews/01-title.png"
                    alt="PaperEcho In-game Title Screen"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 inset-x-4 flex items-center justify-between text-xs text-white/90">
                    <span className="rounded-full bg-black/60 px-3 py-1 backdrop-blur-sm">案头圆窗 · 陶土小人与地球仪</span>
                    <span className="font-mono text-paper/80">3D WebGL</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- 2. ORIGIN & WHY SECTION (起源与初衷 · 为什么做纸上的回声) --- */}
      <section id="origin" className="relative border-b border-[#f0e6d2]/10 bg-[#0e1524] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-[#d4785a] uppercase">
              <Compass className="h-3.5 w-3.5" />
              <span>Origin & Design Rationale</span>
            </div>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-paper sm:text-4xl">
              它从哪里来，为什么要做？
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-paper/75 sm:text-base">
              市面上不缺另一个倾倒情绪的树洞，也不缺满嘴套话的 AI 陪伴机器人。
              <br className="hidden sm:inline" />
              我们想解决的，是深夜里那句真实发生、却不愿面对廉价安慰的话。
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Reason 1: Origin */}
            <div className="rounded-3xl border border-paper/15 bg-[#141d30] p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#d4785a]">01 · 起源</span>
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-paper/60">
                  黑客松命题探索
                </span>
              </div>
              <h3 className="font-display mt-4 text-xl font-bold text-paper">
                捕捉那些没被接住的情绪
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-paper/70">
                项目最初源于一场关于“情绪搜救”的命题探讨。我们发现，真正深陷内耗与社恐的普通人，既不愿意去填冷冰冰的心理量表，也不愿意在公共社交广场上发帖示弱。那些深夜里说不出口的话，往往因为找不到合适的容器，最终只能默默烂在肚子里。
              </p>
            </div>

            {/* Reason 2: No cheap comfort */}
            <div className="rounded-3xl border border-[#d4785a]/40 bg-[#162035] p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#d4785a]">02 · 核心规则</span>
                <span className="rounded-full bg-[#d4785a]/20 px-2.5 py-0.5 font-mono text-[10px] text-[#d4785a]">
                  铁律：不安慰
                </span>
              </div>
              <h3 className="font-display mt-4 text-xl font-bold text-paper">
                用平行事实，替代“我懂你”
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-paper/70">
                多数 AI 对话工具最容易滑向廉价的自我感动——张口闭口“抱抱你、一切都会过去的、加油”。对成年人来说，这些套话不仅苍白，更带有一种居高临下的尴尬。在 PaperEcho 里，人设规则被严格约束：对方绝不安慰、不分析、不说教，只讲他自己今晚平行的具体生活事实。“回应 = 被看见”，用一个真实的细节接住你，远比千句空洞的鸡汤更有力量。
              </p>
            </div>

            {/* Reason 3: Tangible Gestures */}
            <div className="rounded-3xl border border-paper/15 bg-[#141d30] p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#7a9a68]">03 · 物理手势</span>
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-paper/60">
                  真实位移阻尼
                </span>
              </div>
              <h3 className="font-display mt-4 text-xl font-bold text-paper">
                找回写信与折纸的物理重量
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-paper/70">
                现代网页表单把所有的表达简化成了一个“点击发送”按钮，几毫秒的点击让表达变得极其轻飘。为了找回信件的实体感，我们用物理弹簧阻尼重构了交互：克服阻力下拉卡片进房间、手指沿对角线拉拽两次纸角折成机翼、拉紧橡皮筋弹射飞出、沿折痕拉开拆信。每一个推进，都来自手指的真实位移。
              </p>
            </div>

            {/* Reason 4: Zero Social Currency */}
            <div className="rounded-3xl border border-paper/15 bg-[#141d30] p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#e8c56b]">04 · 慢速与抽屉</span>
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-paper/60">
                  零社交货币
                </span>
              </div>
              <h3 className="font-display mt-4 text-xl font-bold text-paper">
                没有红点催促与点赞焦虑
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-paper/70">
                即时通讯里的“已读未回”和社交软件上的点赞比拼，是现代焦虑的最大推手。PaperEcho 不设点赞、不设关注、不设即时弹窗。信件按地球真实大圆经纬度在夜空中慢速飞行，往来信件全部静静叠放在案头底层的红陶抽屉暗格里。你可以关掉屏幕去睡，过几天推开窗时再来看。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- 3. WALKTHROUGH SECTION: 产品怎么用 · 完整游玩流程演示 --- */}
      <section id="walkthrough" className="relative border-b border-[#f0e6d2]/10 bg-[#121a2b] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-[#d4785a] uppercase">
                <Sliders className="h-3.5 w-3.5" />
                <span>Interactive Walkthrough</span>
              </div>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-paper sm:text-4xl">
                产品怎么用 · 完整游玩流程
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-paper/75">
                从深夜下拉进房，到将回信滑入底层抽屉。点击各步骤查看对应的实机操作界面。
              </p>
            </div>

            {/* Auto Play / Pause Control */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlayingWalkthrough(!isPlayingWalkthrough)}
                className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-bold transition-all ${
                  isPlayingWalkthrough
                    ? "clay bg-[#d4785a] text-white shadow-lg"
                    : "border border-paper/20 bg-white/5 text-paper hover:bg-white/10"
                }`}
              >
                {isPlayingWalkthrough ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-[#e8c56b]" />}
                <span>{isPlayingWalkthrough ? "暂停演示" : "▶ 自动播放完整流程"}</span>
              </button>
            </div>
          </div>

          {/* Main Walkthrough Showcase */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left: Device Frame with Real Screen */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="relative w-full max-w-[280px]">
                {/* Outer Phone Shell */}
                <div className="relative overflow-hidden rounded-[2.5rem] border-4 border-paper/25 bg-black p-2.5 shadow-[0_25px_60px_rgba(0,0,0,0.8)]">
                  <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[2rem] bg-[#0c121e]">
                    <img
                      key={currentStep.src}
                      src={currentStep.src}
                      alt={currentStep.title}
                      className="h-full w-full object-cover transition-opacity duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

                    {/* Step Overlay Badge */}
                    <div className="absolute top-4 inset-x-4 flex items-center justify-between text-xs">
                      <span className="rounded-full bg-black/60 px-3 py-1 font-mono text-[11px] font-bold text-white backdrop-blur-md">
                        STEP {currentStep.step} / 08
                      </span>
                      <span className="rounded-full bg-[#d4785a]/90 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                        {currentStep.tag}
                      </span>
                    </div>

                    <div className="absolute bottom-4 inset-x-4">
                      <div className="font-bold text-sm text-white drop-shadow-md">
                        {currentStep.title}
                      </div>
                      <div className="text-[11px] text-white/80 line-clamp-1 mt-0.5">
                        {currentStep.subtitle}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Left/Right Quick Switch Buttons */}
                <div className="mt-4 flex items-center justify-between px-2">
                  <button
                    onClick={() =>
                      setActiveWalkthrough((prev) =>
                        prev === 0 ? WALKTHROUGH_STEPS.length - 1 : prev - 1
                      )
                    }
                    className="flex items-center gap-1 rounded-xl border border-paper/15 bg-white/5 px-3 py-1.5 text-xs text-paper/70 hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>上一步</span>
                  </button>

                  <span className="font-mono text-xs text-paper/50">
                    {activeWalkthrough + 1} of {WALKTHROUGH_STEPS.length}
                  </span>

                  <button
                    onClick={() =>
                      setActiveWalkthrough((prev) => (prev + 1) % WALKTHROUGH_STEPS.length)
                    }
                    className="flex items-center gap-1 rounded-xl border border-paper/15 bg-white/5 px-3 py-1.5 text-xs text-paper/70 hover:bg-white/10 hover:text-white"
                  >
                    <span>下一步</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Step Details and Interactive List */}
            <div className="md:col-span-7 space-y-3">
              {/* Highlight Box for Active Step */}
              <div className="clay rounded-3xl bg-[#f0e6d2] p-6 text-[#1a2744] shadow-xl">
                <div className="flex items-center justify-between border-b border-[#1a2744]/15 pb-3 text-xs font-bold">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#1a2744] px-2 py-0.5 font-mono text-white">
                      第 {currentStep.step} 步
                    </span>
                    <span className="text-base text-[#1a2744]">{currentStep.title}</span>
                  </div>
                  <span className="rounded-full bg-[#d4785a]/15 px-2.5 py-0.5 text-[11px] text-[#d4785a]">
                    {currentStep.tag}
                  </span>
                </div>

                <div className="mt-4 space-y-2.5 text-xs leading-relaxed">
                  <div>
                    <span className="font-bold text-[#d4785a]">你在界面做什么：</span>
                    <span className="ml-1 text-[#1a2744]/80">{currentStep.action}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#7a9a68]">游戏发生什么：</span>
                    <span className="ml-1 text-[#1a2744]/80">{currentStep.result}</span>
                  </div>
                </div>
              </div>

              {/* 8-Step Clickable List */}
              <div className="space-y-1.5 pt-2">
                {WALKTHROUGH_STEPS.map((st, idx) => (
                  <button
                    key={st.step}
                    onClick={() => {
                      setActiveWalkthrough(idx);
                      setIsPlayingWalkthrough(false);
                    }}
                    className={`w-full rounded-2xl px-4 py-2.5 text-left transition-all flex items-center justify-between ${
                      activeWalkthrough === idx
                        ? "border border-[#d4785a] bg-[#1a2744] shadow-md"
                        : "border border-paper/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                          activeWalkthrough === idx
                            ? "bg-[#d4785a] text-white"
                            : "bg-paper/10 text-paper/60"
                        }`}
                      >
                        {st.step}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-paper">{st.title}</div>
                        <div className="text-[11px] text-paper/60 line-clamp-1">{st.subtitle}</div>
                      </div>
                    </div>
                    <span className="hidden text-[10px] font-mono text-paper/40 sm:inline">
                      {st.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- 4. CINEMATIC REEL (实机镜头放映) --- */}
      <section id="cinematic-reel" className="relative border-b border-[#f0e6d2]/10 bg-[#0c121e] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-[#e8c56b] uppercase">
                <Film className="h-3.5 w-3.5" />
                <span>Cinematic Reel</span>
              </div>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-paper sm:text-4xl">
                实机镜头 · 3D WebGL 放映
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-paper/75">
                推开案头圆窗，观测纸飞机在低轨夜云中的巡航轨迹与案头陶土小人。
              </p>
            </div>

            {/* Video Switcher Tabs */}
            <div className="flex gap-2 rounded-2xl border border-paper/15 bg-black/40 p-1.5 backdrop-blur-sm">
              <button
                onClick={() => setActiveVideo("flight")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  activeVideo === "flight"
                    ? "clay bg-[#f0e6d2] text-[#1a2744] shadow-md"
                    : "text-paper/70 hover:text-white"
                }`}
              >
                <span>镜头 A · 云海巡航</span>
              </button>
              <button
                onClick={() => setActiveVideo("room")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  activeVideo === "room"
                    ? "clay bg-[#f0e6d2] text-[#1a2744] shadow-md"
                    : "text-paper/70 hover:text-white"
                }`}
              >
                <span>镜头 B · 案头圆窗</span>
              </button>
            </div>
          </div>

          {/* Full-width 16:9 Cinema Showcase Container */}
          <div className="relative mt-8 overflow-hidden rounded-3xl border border-paper/20 bg-black shadow-2xl">
            <div className="relative aspect-video w-full">
              <video
                key={activeVideo}
                src={activeVideo === "flight" ? "/scenes/flight.mp4" : "/scenes/room.mp4"}
                autoPlay
                loop
                muted={soundMuted}
                playsInline
                className="h-full w-full object-cover"
              />

              {/* Floating Top Badge */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="rounded-full bg-black/70 px-3.5 py-1.5 font-mono text-xs text-white/90 backdrop-blur-md">
                  {activeVideo === "flight"
                    ? "镜头 A · 纸飞机夜空巡航 (3D WebGL / Blender 渲染)"
                    : "镜头 B · 陶土小人与案头圆窗 (3D WebGL / Blender 渲染)"}
                </span>
              </div>

              {/* Sound Toggle Button */}
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={() => setSoundMuted(!soundMuted)}
                  className="flex items-center gap-1.5 rounded-full bg-black/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors hover:bg-black"
                >
                  {soundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  <span>{soundMuted ? "已静音 (点击开启原声)" : "声音已开启"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- 5. DESIGN DETAILS (设计细节 · 实体案头与克制陪伴) --- */}
      <section id="details" className="relative border-b border-[#f0e6d2]/10 bg-[#141d30] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-[#7a9a68] uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Design Foundations</span>
            </div>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-paper sm:text-4xl">
              三个克制的设计细节
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-paper/75">
              消除数字工具的浮躁与廉价感，在案头保留一份真实的物理触感与私人空间。
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Detail 1: Gesture */}
            <div className="rounded-3xl border border-paper/15 bg-[#1a2744] p-6 shadow-xl">
              <div className="clay-sm flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7a9a68] text-white">
                <Feather className="h-6 w-6" />
              </div>
              <h3 className="font-display mt-5 text-lg font-bold text-paper">
                实体手势阻尼
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-paper/70">
                下拉卡片、对角拉拽折纸、拉橡皮筋弹射、下拉拆信。每一个交互步骤都需要手指在屏幕上完成明确的物理位移，不提供一键生成的轻浮表单。
              </p>
            </div>

            {/* Detail 2: No cheap comfort */}
            <div className="rounded-3xl border border-paper/15 bg-[#1a2744] p-6 shadow-xl">
              <div className="clay-sm flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d4785a] text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="font-display mt-5 text-lg font-bold text-paper">
                不安慰人的克制陪伴
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-paper/70">
                对方绝不安慰、不分析、不说教，只讲他自己今晚平行的具体生活事实。用一句真实的日常细节来互相接住，替代尴尬廉价的“我懂你”。
              </p>
            </div>

            {/* Detail 3: Terracotta Drawer */}
            <div className="rounded-3xl border border-paper/15 bg-[#1a2744] p-6 shadow-xl">
              <div className="clay-sm flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8c56b] text-[#1a2744]">
                <Archive className="h-6 w-6" />
              </div>
              <h3 className="font-display mt-5 text-lg font-bold text-paper">
                案头红陶抽屉
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-paper/70">
                往来信件全部归入案头底层的红陶暗格。没有点赞、没有公共信息流、没有已读未回的红点催促。随时可以关掉，想重读时随时拉开抽屉即可。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- 6. FOOTER CTA --- */}
      <footer className="relative border-t border-paper/15 bg-[#0a0f1a] pt-16 pb-12">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="type-clay font-latin text-3xl font-extrabold sm:text-4xl text-paper">
            PAPER ECHO
          </h2>
          <p className="font-display mt-2 text-lg text-paper/90">
            写下一件具体的事，不安慰，只回应。
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              to="/"
              className="clay flex items-center gap-2 rounded-2xl bg-[#f0e6d2] px-8 py-3.5 text-base font-bold text-[#1a2744] transition-all hover:bg-white active:translate-y-0.5"
            >
              <span>推开窗 · 进入房间</span>
              <ArrowRight className="h-4 w-4 text-[#d4785a]" />
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-between border-t border-paper/10 pt-6 text-xs text-paper/50">
            <span>奕枢工坊 · 纸上的回声 PaperEcho © 2026</span>
            <div className="flex gap-4">
              <a href="https://yishuziyu.cn" target="_blank" rel="noreferrer" className="hover:text-white">
                个人主站 yishuziyu.cn
              </a>
              <Link to="/" className="hover:text-white">
                进入产品
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
