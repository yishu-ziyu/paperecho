/**
 * 再来找同一个人。
 *
 * 名字、上次的话、当时的情绪，写在最近一局 Journey 上。
 * 离开之后他自己长出的一件事写在 awayThing。
 * 记住是因为聊过，不按具体不具体筛玩家的话。
 */
import type { EchoPerson, EmotionId, Fingerprint, Journey } from "./types.ts";

export const FALLBACK_NAME = "Michael";

export interface Companion {
  name: string;
  city: string;
  felt: string;
  source: EchoPerson["source"];
  replies: string[];
  returnLetter: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  awayThing: string;
  transcript: { who: "you" | "echo"; text: string }[];
}

const MISS =
  /想你|我想你|很想你|你还好|我懂你|接住|加油|不是一个人/;

export function stableName(raw?: string): string {
  const t = raw?.trim() ?? "";
  return t || FALLBACK_NAME;
}

export function journeyForName(journeys: Journey[], name: string): Journey | undefined {
  const key = stableName(name);
  return journeys.find((j) => stableName(j.echo?.name) === key);
}

function lastOf(transcript: { who: "you" | "echo"; text: string }[], who: "you" | "echo"): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const row = transcript[i];
    if (row?.who !== who) continue;
    const t = row.text.trim();
    if (t) return t;
  }
  return "";
}

/** 模型收回的一件，或沿用上一句。不抽写死句池。 */
export function growAwayThing(lastEcho: string, spoken?: string | null): string {
  const line = (spoken ?? "").trim();
  if (line && !MISS.test(line)) return line.slice(0, 56);
  return lastEcho.trim().slice(0, 56);
}

export function makeCompanion(input: {
  echo: EchoPerson;
  transcript?: { who: "you" | "echo"; text: string }[];
  fingerprint?: Fingerprint[];
  letter?: string;
  awayThing?: string;
}): Companion {
  const transcript = (input.transcript ?? [])
    .map((row) => ({ who: row.who, text: row.text.trim() }))
    .filter((row) => row.text);
  const lastEcho = lastOf(transcript, "echo") || input.echo.greeting.trim();
  const lastYou = lastOf(transcript, "you") || (input.letter ?? "").trim();
  const awayThing =
    (input.awayThing || input.echo.awayThing || "").trim() || growAwayThing(lastEcho);
  return {
    name: stableName(input.echo.name),
    city: input.echo.city.trim() || "杭州",
    felt: input.echo.felt,
    source: input.echo.source,
    replies: input.echo.replies,
    returnLetter: input.echo.returnLetter,
    lastEcho,
    lastYou,
    lastEmotions: (input.fingerprint ?? []).map((f) => f.id),
    awayThing,
    transcript,
  };
}

export function companionFromJourney(journey: Journey): Companion {
  return makeCompanion({
    echo: journey.echo,
    transcript: journey.transcript,
    fingerprint: journey.fingerprint,
    letter: journey.letter,
    awayThing: journey.awayThing,
  });
}

/** 聊完离开：落下这个人，并让日子过掉一件。 */
export function rememberNight(input: {
  echo: EchoPerson;
  transcript: { who: "you" | "echo"; text: string }[];
  fingerprint: Fingerprint[];
  letter: string;
  spoken?: string | null;
}): { echo: EchoPerson; awayThing: string } {
  const grown = makeCompanion({
    echo: input.echo,
    transcript: input.transcript,
    fingerprint: input.fingerprint,
    letter: input.letter,
  });
  const awayThing = growAwayThing(grown.lastEcho, input.spoken);
  const echo: EchoPerson = {
    ...input.echo,
    name: grown.name,
    city: grown.city,
    awayThing,
  };
  return { echo, awayThing };
}

export function echoFromCompanion(c: Companion, greeting?: string): EchoPerson {
  return {
    name: c.name,
    city: c.city,
    felt: c.felt,
    greeting: greeting?.trim() || c.awayThing || c.lastEcho,
    replies: c.replies,
    returnLetter: c.returnLetter,
    source: c.source,
    awayThing: c.awayThing,
  };
}

/** 点名找旧人。空名字 = 扔空白纸，遇新人。 */
export function lockedEchoForMatch(journeys: Journey[], seekName?: string | null): EchoPerson | null {
  const want = seekName?.trim();
  if (!want) return null;
  const found = journeyForName(journeys, want);
  if (!found?.echo) return null;
  return echoFromCompanion(companionFromJourney(found));
}

/** 再见面开口：模型那句，或沿用日子/上一句。不抽写死句池。 */
export function continueGreeting(
  c: Companion,
  _tonight: { letter?: string; emotions?: EmotionId[] } = {},
  spoken?: string | null,
): string {
  const line = (spoken ?? "").trim();
  if (line && !MISS.test(line)) return line.slice(0, 56);
  return (c.awayThing || c.lastEcho).trim().slice(0, 56);
}
