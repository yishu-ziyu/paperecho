# 纸上的回声 · Paper Echo

整晚叫纸上的回声。你不先写心情，用手把一句送到世界上另一个人那里。对方只说自己的事，不安慰你。

未说出口的也值得回应。

## 玩法

手是唯一的提交。点一下不算。

1. 把卡片往下拉，进房间
2. 把靠近你的情绪拖近中心，写下今晚那句，带着走
3. 对角拉，折成飞机，送到窗边
4. 转地球，拉满再放
5. 人找到了，把飞机往下拉，落到桌上
6. 被说中的话放到桌上，或自己写一句。对方只说自己的夜
7. 回信往下拉是拆开；再往下，滑进抽屉

完整逻辑、机制和每个板块的静帧预览：`docs/game-logic-preview.md`。

## 本地运行

```bash
npm install
cp .env.example .env
# 填入 MINIMAX_CN_API_KEY 后，夜里会去找一个也说过类似话的人
npm run dev
```

浏览器打开提示的地址。没有 API key / 请求超时时，自动回退到本地故事卡，旅程仍可完整走完。

Agent 默认 MiniMax CN（`MiniMax-M3`）。备选：`.env` 填 `AI_PING_API_KEY`，并设 `PAPER_ECHO_LLM=aiping`（无 MiniMax key 时也会自动落到 AI PING）。

世界档案：12 张手写故事 + `src/game/collect.ts` 里的预采集改写稿。扔飞机时库先占满 5 条素材开口；现场可短预算爬公开页补空位，失败不影响。爬到的原文改写过闸后写入库。扩库也可 `npm run collect`（Firecrawl / AnySearch / MiniMax；原文只落在本地 `corpus/`，不进游戏）。

## 技术

- React 19 · TanStack Start · Vite · Tailwind v4
- Motion 弹簧跟手 · Cobe 地球
- Pi Agent 驱动三步 Prompt Chain（match / turn / seal），确定性检索 → 单工具 LLM 步 → 校验闸门
- AI 输出永远被规则夹住：禁止安慰词、禁偷玩家原话、禁串城；离线也能完整完成一局
