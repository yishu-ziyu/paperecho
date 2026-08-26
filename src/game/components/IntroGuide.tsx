import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { unlockAudio } from "../audio";
import { PullCommit } from "../continuum";
import { useGame } from "../store";

/**
 * 首夜引导：第一次进入时，在标题上方盖三层卡片。
 * 用游戏自己的语气讲三件事——这是什么、手是唯一的提交、一晚上走几步。
 * 翻页手势就是游戏第一个手势：往下拉。看过一次就不再见，HUD 的「?」可随时重看。
 */
const CARDS = [
  {
    title: "把一句说不出口的话，折成纸飞机",
    body: "深夜，它飞向世界上另一个也醒着的人。今晚只做这一件事。",
  },
  {
    title: "手是唯一的提交",
    body: "拖、折、拉、松开——点一下不算。你已经做对了：往下拉，翻过这一页。",
  },
  {
    title: "一晚上，六步",
    body: "写下一句 → 折成飞机 → 掷向世界 → 听到对方的一句夜 → 拆回信 → 进信柜。对方只说自己的事，不安慰你。",
  },
];

export function IntroGuide() {
  const guideOpen = useGame((s) => s.guideOpen);
  const closeGuide = useGame((s) => s.closeGuide);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (guideOpen) setStep(0);
  }, [guideOpen]);

  if (!guideOpen) return null;
  const card = CARDS[step];
  const last = step === CARDS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/85 p-5">
      <button
        type="button"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 rounded-full px-3 py-1.5 text-xs tracking-[0.2em] text-paper/60 transition-colors hover:text-paper"
        onClick={() => {
          unlockAudio();
          closeGuide();
        }}
      >
        跳过
      </button>
      <PullCommit
        key={step}
        testId="intro-card"
        enabled
        sign={1}
        threshold={48}
        hint="往下拉"
        tapToCommit
        commitBehavior="morph"
        onCommit={() => {
          if (last) {
            unlockAudio();
            closeGuide();
          } else {
            setStep(step + 1);
          }
        }}
        className="w-full max-w-md"
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
          className="clay-sm rounded-2xl p-7 text-center shadow-[0_24px_60px_rgba(12,20,40,0.5)] ring-1 ring-ink/10"
        >
          <p className="text-[0.65rem] tracking-[0.24em] text-ink/45">
            首夜 · {step + 1}/{CARDS.length}
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.3rem,4vw,1.7rem)] font-semibold leading-snug tracking-[0.05em] break-keep text-ink">
            {card.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-ink/60">{card.body}</p>
          <p className="mt-6 text-[0.7rem] tracking-[0.28em] text-ink/35">
            {last ? "往下拉，进房间" : "往下拉"}
          </p>
        </motion.div>
      </PullCommit>
    </div>
  );
}
