# 补纸 · 玩家复验不过：本子被掏空，回访第一句空白

可以改代码。不要开 PR，不要碰 .env，不要 git commit。

## 玩家看见的

按人分本、遇第二个、开场不重复：过。

不过：
1. Jonah.lastWritten 改成 2026-08-25，硬刷新等 40s+。days 变成 []，连原来 08-28 那条也没了。lastWritten 停在 2026-08-25。Diego 同样操作也变 [].
2. 信柜「再去找他」后第一句气泡空白，等 75s 仍空。
3. 同一晚第 2、3 句回声逐字重复上一句。

## 原因（对着现有代码）

catchUp 在 speak() 返回 null 时 delete 掉日期。打开页面时 MiniMax 没真正写回（或没等它），于是把本掏空。writeDay 空串 + 回访 greet 空串，桌上就是空白。

## 必须怎样

1. 打开游戏 / 再去找他：pulseHeartbeat、catchUp、回访第一句都要 await 现有 MiniMax（runVoice / speakDay / speakGreet）。浏览器里网络能看到调用。
2. 模型没回来：已有的 days 一条都不许删。lastWritten 不许倒退到把本掏空。这一天先不写，下次打开再问。
3. 模型回来了：26/27/28 各一句新的，互不相同，也不等于 lastEcho。
4. 回访第一句不许空白。等 MiniMax；还是空，再用他日子本里最后一句成功的话顶上（那是旧句，不是冒充新的一天）。
5. 同一晚每一句回声都是一次新的 MiniMax，不许把上一句再贴一遍。
6. 单测：speak=null 时原有 days 仍在；speak 成功时三天三句；greet 空串不能当第一句写出。tsc 过。

切片 3 已过的（分本、找旧人、遇新人、上海日历）不许弄坏。
