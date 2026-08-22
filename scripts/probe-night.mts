import { runNight } from "../src/game/agent/pi-echo.ts";

const res = await runNight("match", {
  fingerprint: [
    { id: "unseen", closeness: 0.9 },
    { id: "tired", closeness: 0.6 },
  ],
  letter: "改到凌晨 群里只回了收到",
  region: "east",
  mirror: "我改了十七稿方案，群里只回了一句收到。灯还开着，像在等一个不存在的点头。",
  archival: [
    {
      id: "m-test",
      memory: "写过：改到凌晨，群里只回了收到",
      emotions: ["unseen"],
      region: "east",
      echoName: "林予",
      createdAt: Date.now(),
    },
  ],
  echo: {
    name: "林予",
    city: "杭州",
    felt: "没被点头",
    greeting: "我改了十七稿方案，群里只回了一句收到。灯还开着，像在等一个不存在的点头。",
    replies: ["十七稿我打成一包，塞进抽屉最下层。"],
    returnLetter: "抽屉那包还在。你要是也有一包，先别扔。",
    source: "archive",
  },
});

console.log(
  JSON.stringify(
    {
      echo: res.echo,
      spoken: res.spoken,
      suggestions: res.suggestions,
      facts: res.facts,
      hits: res.hits.map((h) => h.slice(0, 80)),
      meter: res.meter,
      sessionLen: res.session.length,
    },
    null,
    2,
  ),
);
