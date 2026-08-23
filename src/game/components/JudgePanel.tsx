import { X } from "lucide-react";
import { useEffect } from "react";
import { useGame } from "../store";
import { ownedOf } from "../emotions";
import { EMOTION_MAP } from "../emotions";

function judgeHotkeyBlocked(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return true;
  const el = e.target;
  return (
    el instanceof Element &&
    Boolean(el.closest("textarea, input, select, [contenteditable]:not([contenteditable='false'])"))
  );
}

export function JudgePanel() {
  const open = useGame((s) => s.judgeOpen);
  const toggle = useGame((s) => s.toggleJudge);
  const phase = useGame((s) => s.phase);
  const meter = useGame((s) => s.meter);
  const fp = useGame((s) => s.fingerprint);
  const echo = useGame((s) => s.echo);
  const hits = useGame((s) => s.hits);
  const archival = useGame((s) => s.archival);
  const recall = useGame((s) => s.recall);
  const core = useGame((s) => s.core);
  const exchange = useGame((s) => s.exchange);
  const talking = phase === "encounter";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "J") return;
      if (talking || judgeHotkeyBlocked(e)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, talking]);

  if (talking || !open) return null;
  const owned = ownedOf(fp, 0.3);

  return (
    <aside className="absolute inset-x-3 top-16 z-40 mx-auto max-w-md rounded-2xl bg-paper/95 p-4 shadow-xl backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg">回声系统</h3>
        <button type="button" className="grid size-9 place-items-center" onClick={toggle} aria-label="关闭">
          <X className="size-4" />
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink/55">
        Prompt Chain · match / turn / seal 三链
        <br />
        每链：确定性检索 → 单工具 LLM 步 → 校验闸门
      </p>
      <dl className="grid grid-cols-2 gap-3 font-mono text-sm tabular-nums">
        <div>
          <dt className="text-xs text-ink/50">节点</dt>
          <dd>{meter?.node || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">路径</dt>
          <dd>{meter?.via === "live" ? "实时链" : "本地信柜"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">模型</dt>
          <dd>{meter?.model ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">合计 Token</dt>
          <dd>{meter?.total ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">核心 / 回忆</dt>
          <dd>
            {core.persona ? 1 : 0} / {recall.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">档案记忆</dt>
          <dd>
            {archival.length}（用了 {hits.length}）
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink/55">
        {echo ? `${echo.name} · ${echo.city}` : "尚未起飞"}
        {echo ? ` · 说到${["发生的事", "当时的感觉", "后来改了什么"][exchange.unlocked - 1]}` : ""}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {owned.map((f) => (
          <li
            key={f.id}
            className="rounded-full px-2 py-0.5 text-xs text-paper"
            style={{ background: EMOTION_MAP[f.id].color }}
          >
            {EMOTION_MAP[f.id].label} {(f.closeness * 100).toFixed(0)}%
          </li>
        ))}
      </ul>
      {hits.length ? (
        <ul className="mt-3 space-y-1 text-xs text-ink/55">
          {hits.slice(0, 3).map((h) => (
            <li key={h} className="truncate">
              · {h}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-ink/45">按 J 开关。无 API Key / 超时自动回退本地故事卡。</p>
    </aside>
  );
}
