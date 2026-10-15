# Paper Echo · AI Agent 层：代码之外的约定

> 结构看代码：流水线（倾听 → 搜索 → 整合 → 回应）见 `src/game/agent/pipeline/index.ts` 文件头，
> 运行时 match / turn / seal 见 `src/game/agent/chains.ts` 文件头，回应规范见 `src/game/agent/pipeline/respond.ts` 文件头。
> 本文只记代码里没有的。

## 语料合规（MediaCrawler 预爬）

- 仅限学习研究使用，不用于商业分发。
- 只采集公开内容，不采集私密/受限内容。
- 输出前脱敏：去除姓名、头像、账号 ID、联系方式、可定位的地理细节。

## 待办

- [ ] 离线评测：固定 profile 集 + 标注帖集，量化各数据源（local / crawl / live）素材库的质量与可复现性。
