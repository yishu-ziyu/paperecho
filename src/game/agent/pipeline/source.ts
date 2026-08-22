/**
 * Paper Echo — 流水线 · 搜索层 Source
 *
 * 搜索层的可插拔数据源契约。任何实现 `PostSource` 的对象都能接进流水线，
 * 换语料只换源，不动 Profile / Persona 两段。
 */
import type { EmotionId } from "../../types";
import type { PlayerProfile } from "./profile";

/** 一条「帖子」——搜索层产出、回应层消费的最小单位。 */
export interface Post {
  /** 来源平台标识，如 "archive" / "xiaohongshu" / "douban"。 */
  platform: string;
  /** 帖子正文。 */
  content: string;
  /** 帖子携带的情绪标签（EmotionId）。 */
  emotion: EmotionId[];
  /** 一句话情境摘要（供 persona 映射 / 日志 / 评测）。 */
  situation: string;
}

/** 可插拔数据源。`id` 用于切换与记录，`search` 是唯一执行入口。 */
export interface PostSource {
  id: string;
  search(profile: PlayerProfile): Promise<Post[]>;
}
