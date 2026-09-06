/**
 * Paper Echo — 匹配 golden fixtures（Task 2A Phase 1）。
 *
 * 每条 fixture 是「玩家今晚的话」的语义改写：禁止复制任何 Story（STORIES + COLLECTED）
 * 原句的 ≥6 连续字（测试里有全池查重把关）。emotions 是产品口径
 * ownedOf(fp, 0.3) 之后的 feels（可只给部分，故意制造「情绪不判别」的局面）。
 *
 * acceptableIds 收紧：只放语义上真正正确的答案，不为凑数放宽。
 * avoid 存在时，答案应为避开之后的合理替代者。
 */
import type { EmotionId, RegionId } from "../types.ts";

export interface MatchFixture {
  /** f01…f18 */
  id: string;
  /** 玩家今晚的话（语义改写，禁止复制 Story 原文句子） */
  letter: string;
  /** 可选短句（镜子句，Phase 2 的文本信号可用） */
  mirror?: string;
  /** 情绪指纹（产品口径 ownedOf(fp, 0.3) 之后的 feels，可只给部分） */
  emotions: EmotionId[];
  /** 缺省 east */
  region?: RegionId;
  /** 传入评分链的 avoidNames；出现时答案应为替代者 */
  avoid?: string[];
  /** 合理答案集（收紧：任一命中算对，但不许放宽凑数） */
  acceptableIds: string[];
  /** 这条 fixture 考什么 */
  note?: string;
}

export const MATCH_FIXTURES: MatchFixture[] = [
  {
    id: "f01",
    letter: "这份方案我推翻重来过十几次，最后丢进群里就沉了底，只等来两个字：收到。",
    mirror: "灯还亮着，屋里没人说第二句。",
    emotions: ["unseen", "gloom"],
    region: "east",
    acceptableIds: ["s1"],
    note: "curated：方案改十几稿、群里只回收到了 → s1（林予）。同池 s6 情绪完全同分，靠文本应仍归 s1。",
  },
  {
    id: "f02",
    letter: "明天要上场的事，我在脑子里预演到第五遍，每一遍都以搞砸收场。现在两点多，人清醒得像白天。",
    mirror: "待办清单我划掉一条，又添了两条。",
    emotions: ["anxious"],
    region: "east",
    acceptableIds: ["s3"],
    note: "curated：明天的事预演很多遍、凌晨盯清单 → s3（Jonah）。只给单个泛情绪 anxious，同池 s9 同分，考处境判别。",
  },
  {
    id: "f03",
    letter:
      "答辩讲完了，掌声稀稀拉拉就散了。为我熬到后半夜的那几十页幻灯，从头到尾没人提起，我甚至怀疑它们到底有没有存在过。",
    emotions: ["unseen", "wronged"],
    region: "east",
    acceptableIds: ["s12"],
    note: "curated：答辩结束没人看到改到凌晨的页 → s12（Priya）。region 故意给 east：region 加分不该把文本更贴的 s12 压成 s4。",
  },
  {
    id: "f04",
    letter:
      "一家老小的事都在我肩上排着队，一件件接住、一件件放下。忙完一圈没人问过我一句：撑着的那个人累不累。",
    mirror: "茶壶端起来又放下，还是没喝。",
    emotions: ["wronged"],
    region: "east",
    acceptableIds: ["s10"],
    note: "curated：家里的事一个人托着、没人问托的人累不累 → s10（Leila）。同情绪 wronged 在 east 有 s4，考处境判别而非情绪+region。",
  },
  {
    id: "f05",
    letter: "我端出去的是最花心思的那份，收回来就一句轻轻的『知道了』。我陪着笑，腮帮子上的劲一直没卸。",
    emotions: ["wronged"],
    region: "east",
    acceptableIds: ["s4"],
    note: "同 region=east、同情绪池：交出最用心的东西换来客气话 → s4（阿宁）。与 f04 构成「同情绪不同处境」对。",
  },
  {
    id: "f06",
    letter: "明天的汇报我在脑子里顺了五遍，一遍比一遍像要出事。后半夜还睁着眼，列好的单子在眼前一条条过。",
    emotions: ["anxious", "tired"],
    region: "europe",
    acceptableIds: ["s3"],
    note: "不同 region 高相似处境：预演/清单 query 但 region=europe → s3 应赢过 europe 的 s2/s11，而不是被 region 留在当地。",
  },
  {
    id: "f07",
    letter: "港口的灯一排排亮到很远，没有一盏在等我回去。窗我照旧留着缝，好像还有人会从那边进来坐下。",
    emotions: ["lonely", "calm"],
    region: "east",
    acceptableIds: ["s2"],
    note: "不同 region 高相似处境：港口/窗/等一个不会来的人，region=east → s2（Mara）应赢过 east 各条（s5/s6/s9 都搭不上港口与窗）。",
  },
  {
    id: "f08",
    letter: "白班在车间里站满十二个钟头，最后一套模具卸完，手就稳不住了。回到宿舍整个人像被拧干，眼皮先一步合上了。",
    emotions: ["tired"],
    region: "east",
    acceptableIds: ["c002"],
    note: "COLLECTED：车间/模具/十二小时白班 → c002（阿枳）。baseline 的 matchStory 只扫手写池，COLLECTED 结构性不可见。",
  },
  {
    id: "f09",
    letter: "凌晨四点多就睁着眼了，天还是那种没亮的灰。手机让我翻过去压在枕头边上，就怕一眼瞟见那些未读的红点。",
    emotions: ["anxious", "tired"],
    region: "east",
    acceptableIds: ["c006"],
    note: "COLLECTED：手机扣床头/凌晨醒来/怕未读消息 → c006（苏平）。情绪与 c006 完全相容，baseline 却只能看见手写池。",
  },
  {
    id: "f10",
    letter:
      "碗刷到一半我坐到了厨房地砖上，冰箱在旁边嗡了一整晚。想找个人讲两句，通讯录从头划到尾，也没挑出一个这个点能拨的号码。",
    mirror: "锅还泡在水里，我也没力气刷。",
    emotions: ["lonely"],
    region: "east",
    acceptableIds: ["c008"],
    note: "COLLECTED：厨房地上/冰箱嗡嗡/想找人说话翻了三屏 → c008（林野）。只给 lonely，baseline 会落进手写池 lonely 平分组。",
  },
  {
    id: "f11",
    letter:
      "后半夜关上房门写字，三张纸每张都停在最中间，有一张揉成一团压在杯口上。那支圆珠笔划出来的线已经时断时续，快写空了。",
    emotions: ["tired", "unseen"],
    region: "east",
    acceptableIds: ["c012"],
    note: "COLLECTED：深夜写东西/纸写一半/圆珠笔快没水 → c012（苏榆）。tired+unseen 双重叠在 baseline 里正好喂给 s1。",
  },
  {
    id: "f12",
    letter:
      "今天连更新的提醒都按掉了，屏幕暗下来，屋里就剩下冰箱的声音。写了半年多的那本册子摊在手边，我一页没翻。咖啡凉透了也没起来倒。",
    emotions: ["tired"],
    region: "east",
    acceptableIds: ["c014"],
    note: "COLLECTED：日更闹钟/手账半年没翻/凉咖啡 → c014（阿岑）。与 f08 同样只给 tired，考处境文本能不能把两条区分开。",
  },
  {
    id: "f13",
    letter:
      "后半夜守在小孩床边的小凳上，他一翻身我就过去掖被子。那张皱成一团的卷子我抚平了收回抽屉，最后摞碗冲到手指都发白。",
    mirror: "水壶的闸跳了，我按回去又站了一会儿。",
    emotions: ["gloom", "anxious"],
    region: "east",
    acceptableIds: ["c007"],
    note: "COLLECTED：夜里守着孩子/揉皱的卷子/脏碗冲到指尖发白 → c007（苏敏）。gloom+anxious 双重叠在 baseline 里喂给 s9。",
  },
  {
    id: "f14",
    letter: "那句话我在对话框里打完又删掉，来回好几回，最后也没发出去。屋里的灯我一直开着，像给谁留一条门缝。",
    emotions: ["lonely", "gloom"],
    region: "europe",
    avoid: ["Mara"],
    acceptableIds: ["s6"],
    note: "avoidNames：Mara（s2）被明确避开后，打又删/留灯的处境应落到替代者 s6（Iris）；不允许因为旧答案被避开而退回不相关的人。",
  },
  {
    id: "f15",
    letter: "晚高峰的车厢里人人都低着头，我对着车门玻璃把表情摆好，把那句『我没事』练到听着像真的。",
    emotions: ["anxious"],
    region: "east",
    acceptableIds: ["s9"],
    note: "同情绪不同处境：与 f02 一样只给 anxious，但处境是车厢里练习没事 → s9（美咲）。纯情绪+region 排序无法把它和 s3 分开。",
  },
  {
    id: "f16",
    letter: "会上他们说我反应过头，我点着头把火苗一点点摁回去，散场后一个人在楼梯间站到腿麻。",
    emotions: ["anger", "wronged"],
    region: "america",
    acceptableIds: ["s8"],
    note: "被说太敏感、把火收起来 → s8（Diego）。情绪双重叠与 region 一致时的正例，用来证明集子里存在 baseline 能拿下的题。",
  },
  {
    id: "f17",
    letter:
      "快十二点了，客厅这盏灯亮到现在，沙发缝里摸到下午那杯早就凉掉的茶。手机让我压进了抽屉最深处，卫生间一有动静我就竖着耳朵听。",
    emotions: ["tired", "lonely"],
    region: "east",
    acceptableIds: ["c005"],
    note: "COLLECTED（加量）：深夜客厅灯/凉茶/手机藏进抽屉/听着家里动静 → c005（林小婉）。与 f09 同属「藏手机」但处境细节不同，应分别归位。",
  },
  {
    id: "f18",
    letter:
      "雨下到第三天，我早上把闹钟取消了，想看看不赶时间的一天长什么样。半夜醒过来伸手碰了碰手机，屏幕是黑的，翻个身又迷迷糊糊睡着了。",
    emotions: ["tired", "calm"],
    region: "east",
    acceptableIds: ["c011"],
    note: "COLLECTED（加量）：连日落雨/不再定闹钟/半夜醒来又睡着 → c011（林舟）。tired+calm 双重叠在 baseline 里喂给 s5/s11。",
  },
];
