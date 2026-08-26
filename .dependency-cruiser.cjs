/** Dependency rules for Paper Echo — 冻结现有分层，防止 Agent 迭代中悄然劣化。
 *
 * 设计原则：让今天的代码全部通过，只咬住未来的违规。
 * 规则依据的是现状已经成立的依赖方向（见 docs/HANDOFF.md 与 CODE_WIKI.md），
 * 不是理想化的架构愿景。形状该变的时候：改这条规则文件，让架构演进
 * 始终是一次显式决策。
 *
 * 运行：npm run check:deps
 */
module.exports = {
  forbidden: [
    /* ── 1. 循环依赖：重构的最危险结构 ─────────────────────── */
    {
      name: "no-circular",
      comment: "循环依赖让模块无法独立理解与测试，重构时最容易连锁断裂。",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    /* ── 2. 游戏域与认证域双向隔离 ───────────────────────────
     * 唯一豁免：src/game/agent/server.ts 是 server fn 边界层
     * （controller 角色），在那里挂 authMiddleware 是分层的标准形
     * 态——auth 中间件本就为 server fn 设计。边界层之外，游戏内部
     * （chains/store/kernel/UI）仍禁止感知认证。
     */
    {
      name: "game-not-to-auth",
      comment: "游戏逻辑不感知认证。混入后每次 auth 变更都会波及游戏流程。",
      severity: "error",
      from: { path: "^src/game/", pathNot: "^src/game/agent/server\\.ts$" },
      to: { path: "^src/lib/auth/" },
    },
    {
      name: "agent-server-auth-surface",
      comment: "边界层只准挂 authMiddleware，不准深挖 auth 内部模块。",
      severity: "error",
      from: { path: "^src/game/agent/server\\.ts$" },
      to: { path: "^src/lib/auth/", pathNot: "^src/lib/auth/middleware\\.ts$" },
    },
    {
      name: "auth-not-to-game",
      comment: "认证层同理，不反向触碰游戏内部。",
      severity: "error",
      from: { path: "^src/lib/auth/" },
      to: { path: "^src/game/" },
    },

    /* ── 3. src 不依赖 scripts ────────────────────────────────
     * 已知豁免（模板遗产，各有理由，新增豁免必须附注释）：
     * - src/lib/db.ts → scripts/migration-plan.mjs：迁移计划与 db.ts 的
     *   glob 范围必须一致（见两处源码注释）。
     * - src/lib/auth/client.ts → scripts/sign-out-plan.mjs：签出时序逻辑
     *   为可单测而住在 scripts/（模板作者的选择，auth 域标明 do-not-
     *   rewrite）。正确的家是 src/lib/auth/，搬动需要 auth 域专项改造。
     * 例外被精确雕刻为「这一个文件 → 这一个脚本」，不放松其他任何边。
     */
    {
      name: "src-not-to-scripts",
      comment: "构建脚本不是运行时依赖。src → scripts 的边会让源码无法独立打包。",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: ["^src/lib/db\\.ts$", "^src/lib/auth/client\\.ts$"],
      },
      to: { path: "^scripts/" },
    },
    {
      name: "known-src-to-scripts-edges",
      comment: "db.ts 只准碰 migration-plan；client.ts 只准碰 sign-out-plan。",
      severity: "error",
      from: { path: "^src/lib/db\\.ts$" },
      to: { path: "^scripts/", pathNot: "^scripts/migration-plan\\.mjs$" },
    },
    {
      name: "auth-client-to-other-scripts",
      comment: "auth/client.ts 指向 sign-out-plan 以外脚本的边仍然禁止。",
      severity: "error",
      from: { path: "^src/lib/auth/client\\.ts$" },
      to: { path: "^scripts/", pathNot: "^scripts/sign-out-plan\\.mjs$" },
    },

    /* ── 4. 状态/逻辑层不依赖 UI 层 ───────────────────────────
     * src/game 顶层的 *.ts（store、kernel、save、stories……）是状态与
     * 逻辑层；phases/ 与 components/ 是 UI 层。方向只能 UI → 逻辑。
     */
    {
      name: "game-core-not-to-ui",
      comment: "状态与逻辑层不 import UI。反向依赖会让 store 的测试需要 React 才能跑。",
      severity: "error",
      from: { path: "^src/game/[^/]+\\.ts$" },
      to: { path: "^src/game/(phases|components)/" },
    },

    /* ── 5. 孤儿模块：无入边也无出边的死代码 ──────────────────
     * 本项目已经历过一轮死代码清理（HANDOFF §2.1），这条防复发。
     * 例外是真实的入口点：测试文件（由 node --test 发现）、约定式注册的
     * nitro 中间件（server/middleware/ 由构建工具自动接线）。
     */
    {
      name: "no-orphans",
      comment: "孤儿模块 = 死代码的沉积层。新增文件必须有引用方，或在此登记入口理由。",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "\\.test\\.ts$",
          "^server/middleware/",
          "\\.d\\.ts$",
          "\\.json$",
          // 纯类型契约模块：运行时图里无出边，入边全是 import type
          // （编译期消费）。它们不是死代码，是这个形态的合法成员。
          // 新增类型契约模块命中此规则时，在此登记。
          "^src/game/agent/types\\.ts$",
          "^src/game/agent/pipeline/source\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    /* 不深入 node_modules 内部；我们只校验自己的模块边界 */
    doNotFollow: { path: "node_modules" },
    /* 读 tsconfig 的 paths，让 @/* 别名可解析 */
    tsConfig: { fileName: "tsconfig.json" },
    /* vite 生态的虚拟模块与资源不是依赖图的一部分 */
    exclude: { path: "^(node_modules|\\.output|dist)" },
    reporterOptions: { dot: { theme: { graph: { rankdir: "TB" } } } },
  },
};
