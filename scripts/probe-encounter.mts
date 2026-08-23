/**
 * 真跑 match → turn → turn → seal，对照「链吐出的字」和「桌上会看到的字」。
 *
 *   AI_PING_API_KEY=… npx -y tsx scripts/probe-encounter.mts
 *
 * 不把密钥写进仓库。无 key / 401 / 空正文时，链应标 archive，桌上走本地故事卡。
 */
import { echoChain } from "../src/game/agent/chains.ts";
import { fallbackEcho } from "../src/game/kernel.ts";
import { playerHand } from "../src/game/emotions.ts";

const fingerprint = [
  { id: "unseen" as const, closeness: 0.86 },
  { id: "tired" as const, closeness: 0.71 },
];
const letter = "群里只回了收到，灯还开着。";
const player1 = "我改到凌晨，群里只回了收到，灯还开着。";
const player2 = "那几页我塞进抽屉最下层，到现在都没打开。";
const player3 = "我把灯留着，像在等一个不存在的点头。";

function tableSpoken(raw: string) {
  return raw.trim();
}

const local = fallbackEcho(fingerprint, "east");
const match = await echoChain.match({
  fingerprint,
  letter,
  region: "east",
  mirror: letter,
  archival: [],
  echo: null,
});

const echo = match.echo;
const greet = echo.greeting;
let recall = [{ who: "echo" as const, text: greet }];

const turn1 = await echoChain.turn({
  fingerprint,
  letter,
  region: "east",
  mirror: letter,
  archival: [],
  echo,
  recall: [...recall, { who: "you", text: player1 }],
  playerLine: player1,
  exchange: match.exchange,
  session: match.session,
});
const t1shown = tableSpoken(turn1.spoken);
recall = [...recall, { who: "you", text: player1 }, { who: "echo", text: t1shown }];

const turn2 = await echoChain.turn({
  fingerprint,
  letter,
  region: "east",
  mirror: letter,
  archival: [],
  echo: { ...echo, ...turn1.echo },
  recall: [...recall, { who: "you", text: player2 }],
  playerLine: player2,
  exchange: turn1.exchange,
  session: turn1.session,
});
const t2shown = tableSpoken(turn2.spoken);
recall = [...recall, { who: "you", text: player2 }, { who: "echo", text: t2shown }];

const seal = await echoChain.seal({
  fingerprint,
  letter,
  region: "east",
  mirror: letter,
  archival: [],
  echo: { ...echo, ...turn2.echo },
  recall: [...recall, { who: "you", text: player3 }],
  playerLine: player3,
  exchange: turn2.exchange,
  session: turn2.session,
});

const out = {
  hasKey: Boolean(process.env.AI_PING_API_KEY),
  local: { name: local.name, city: local.city, greeting: local.greeting },
  match: {
    via: match.meter.via,
    source: match.echo.source,
    name: echo.name,
    city: echo.city,
    felt: echo.felt,
    greeting: greet,
    sameAsLocal: greet === local.greeting,
    suggestionsFromChain: match.suggestions,
    suggestionsOnTable: playerHand(fingerprint, [], [greet, letter]),
    exchange: match.exchange,
  },
  turn1: {
    via: turn1.meter.via,
    spokenRaw: turn1.spoken,
    spokenShown: t1shown,
    exchange: turn1.exchange,
    speak: turn1.speak,
    speakMode: turn1.speakMode,
  },
  turn2: {
    via: turn2.meter.via,
    spokenRaw: turn2.spoken,
    spokenShown: t2shown,
    exchange: turn2.exchange,
    speak: turn2.speak,
    speakMode: turn2.speakMode,
  },
  seal: {
    via: seal.meter.via,
    returnLetter: seal.echo.returnLetter,
  },
  table: [...recall, { who: "you" as const, text: player3 }],
};

console.log(JSON.stringify(out, null, 2));
