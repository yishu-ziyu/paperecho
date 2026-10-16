# 夜间小星球：用光、颜色和高地标代替箭头

背景：小圆星球，夜晚，送信到 5 户。现在用箭头引导，测试者觉得走路无聊。

## 1. 地标按"引力"分级（塞尔达 旷野之息）
- 游戏做法：任天堂按大小给建筑排"引力"。特殊地形最强，其次是塔、狼烟、马厩。玩家看到哪个就会走向哪个。早期塔排得太规律，玩家觉得被牵着走，团队后来改了布局。
- 来源：CEDEC 2017 演讲。https://www.ndw.jp/post-1121/ ；英文译稿 https://www.thefamicast.com/2017/12/part-1-managing-tasks-and-world-design.html
- 事实：引力分级、改塔的位置，都是开发者在演讲里说的。
- 推论：5 户的地标高度要分出高低。下一站最高，已送达的可以降低或熄灯。
- 图：botw_slide_016.jpg（按大小分级的引力）

## 2. 用遮挡让目标"慢慢露出来"（旷野之息 三角形法则）
- 游戏做法：山丘挡住视线。玩家绕过或爬上去时，塔从顶端开始一点点露出来。
- 来源：同上；https://www.gamedeveloper.com/design/5-design-lessons-learned-from-i-the-legend-of-zelda-breath-of-the-wild-i-
- 事实：三角形分大、中、小三种，分别是地标、遮挡、节奏。
- 推论：小星球的曲率本身就会遮挡。低处的房子会藏在地平线下，只有高塔尖能露出来。所以地标顶端要放一盏灯，人走近时再露出窗户的颜色。
- 图：botw_slide_024.jpg

## 3. 星球太小会让玩家乱走（Outer Wilds）
- 游戏做法：开发者说，星球太小、地平线弯得太厉害，玩家明显在漫无目的地走。他们改用路径和线索，让玩家知道自己是否在主动探索。
- 来源：https://www.mobiusdigitalgames.com/news/the-intentionality-of-wandering
- 事实：这是 Alex Beachum 本人的原话。
- 推论：这条和我们最相关。地标必须高到能越过地平线。线索也要指向"南极""湖边"这类玩家能认出的地方。

## 4. 一个始终可见的终点（Journey）
- 游戏做法：远处有一座山，山顶射出光柱，全程都能看到。游戏里没有小地图和目标标记。
- 来源：https://www.gamesindustry.biz/ten-years-later-jenova-chen-reflects-on-journey ；https://www.gamedeveloper.com/design/a-personal-journey-jenova-chen-s-goals-for-games
- 事实：有山和光柱，没有 HUD。
- 推论：夜里光柱比实体模型更容易看到。可以给"下一位收信人"的房子加一道竖直光柱，送达后关掉。
- 图：journey_mountain.jpg

## 5. 地标要有奖励，也要能认出来（迪士尼 weenie）
- 游戏做法：迪士尼把城堡这类远处高建筑叫 weenie，用它吸引游客走过去。Imagineer John Hench 说，weenie 要保证走过去有回报。
- 来源：https://mouseplanet.com/the-origin-of-the-disneyland-wienie/5245/
- 事实：上面是 Hench 书中的原话。
- 推论：每户的地标形状和窗光行为都要不同，比如风车、钟楼、灯塔，或暖黄常亮、蓝光闪烁。信里的线索写成"闪蓝光的钟楼"，不直接给坐标。可以做眯眼测试：眯起眼看画面，最亮的地方就是玩家会去的地方。

## 6. 用地图和地名代替标记（Firewatch）
- 游戏做法：方向通过对讲机里提到的地图地标给出。玩家自己看纸质地图和指南针找路。
- 来源：https://www.gamedeveloper.com/design/how-firewatch-s-ui-enhances-player-immersion （第三方分析）
- 事实：游戏用纸质地图，没有 HUD 路点。
- 推论：可以保留一张手绘星球图，信里写地名。箭头可以改成迷路 60 秒后才出现的辅助。
