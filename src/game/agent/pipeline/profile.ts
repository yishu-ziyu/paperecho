/**
 * Paper Echo — 流水线 · 倾听层 Profile
 *
 * 把玩家在游戏里留下的结构化数据合成为「玩家画像」，供搜索层匹配。
 * 三段流水线：Profile（倾听）→ PostSource（搜索）→ synthesize（整合成合成影子）。
 */
import { ownedOf } from "../../emotions";
import type { EmotionId, Fingerprint } from "../../types";

/**
 * 玩家画像 —— 搜索层唯一关心的输入。
 *
 * - `emotions`：由情绪拖拽产出 Fingerprint 后提取，已是最稳定的结构化信号。
 * - `story`：故事表单（玩家选中的叙事片段）。本阶段只留字段，来源 TODO。
 * - `persona`：人格趣味题（玩家偏好/性格标签）。本阶段只留字段，来源 TODO。
 */
export interface PlayerProfile {
  emotions: EmotionId[];
  story: string;
  persona: string;
}

/**
 * 从 Fingerprint[] 提取 EmotionId[]。
 *
 * 与 tools.ts / kernel.ts 同一口径：取贴近圆心（closeness ≥ 0.3）的情绪，
 * 空则回退到最近的那一颗。TODO(接 store)：情绪拖拽完成后由 store 调
 * `fingerprintOf(tokens)` 产出 Fingerprint，再经此函数转成 EmotionId[]。
 */
export function emotionsOf(fp: Fingerprint[]): EmotionId[] {
  return ownedOf(fp, 0.3).map((f) => f.id);
}

/** 组装一张玩家画像。story / persona 尚未接入时传空串即可。 */
export function makeProfile(
  emotions: EmotionId[],
  story = "",
  persona = "",
): PlayerProfile {
  return { emotions, story, persona };
}
