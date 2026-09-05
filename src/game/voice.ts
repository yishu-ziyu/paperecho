import { runVoice } from "./agent/server";
import type { DaySpeaker } from "./heartbeat.ts";
import type { EmotionId } from "./types.ts";

async function ask(kind: "day" | "away" | "greet" | "turn", input: {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  prev: string;
  date?: string;
  days?: { date: string; text: string }[];
  letter?: string;
}): Promise<string | null> {
  try {
    const res = await runVoice({
      data: {
        kind,
        name: input.name,
        city: input.city,
        lastEcho: input.lastEcho,
        lastYou: input.lastYou,
        lastEmotions: input.lastEmotions,
        prev: input.prev,
        date: input.date,
        days: input.days,
        letter: input.letter,
      },
    });
    return res.text?.trim() || null;
  } catch {
    return null;
  }
}

/** 产品路径：补日子。模型没回来这一天不写。 */
export const speakDay: DaySpeaker = (input) =>
  ask("day", {
    name: input.name,
    city: input.city,
    lastEcho: input.lastEcho,
    lastYou: input.lastYou,
    lastEmotions: input.lastEmotions,
    prev: input.prev,
    date: input.date,
    days: input.days,
  });

export function speakAway(input: {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  letter?: string;
  days?: { date: string; text: string }[];
}): Promise<string | null> {
  return ask("away", {
    ...input,
    prev: input.lastEcho,
  });
}

export function speakGreet(input: {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  letter?: string;
  days?: { date: string; text: string }[];
}): Promise<string | null> {
  return ask("greet", {
    ...input,
    prev: input.days?.at(-1)?.text || input.lastEcho,
  });
}

export function speakTurn(input: {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  letter?: string;
  days?: { date: string; text: string }[];
}): Promise<string | null> {
  return ask("turn", {
    ...input,
    prev: input.lastEcho,
  });
}
