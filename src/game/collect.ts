/**
 * 预采集世界档案。由 scripts/collect/run.mts 生成。
 * 原文不入库、不进游戏；运行时只读本文件。
 */
import type { Story } from "./types.ts";

export const COLLECTED: Story[] = [
  {
    id: "c001",
    name: "陈木",
    city: "杭州",
    region: "east",
    feels: ["tired", "anxious", "calm"],
    opening: "凌晨一点我关了电脑，靠在椅背上。",
    lines: ["桌角那杯茶凉透了，我没动。", "歌单循环了四十几遍，我自己也不知道为啥。"],
    returnLetter: "那杯茶还在。歌要是还在响，先别关。",
    source: "collected",
  },
  {
    id: "c002",
    name: "阿枳",
    city: "厦门",
    region: "east",
    feels: ["anxious", "tired"],
    opening: "白班十二个小时一过，我像被抽空一样晃回宿舍。",
    lines: [
      "八吨的模具拆下来，手还在抖，眼皮已经塌了。",
      "车间没动静，我把脸贴到机台边沿，想眯两分钟。",
    ],
    returnLetter: "那张罚单我还留着。你要是也有一张，先别撕。",
    source: "collected",
  },
  {
    id: "c005",
    name: "林小婉",
    city: "长沙",
    region: "east",
    feels: ["tired", "calm", "lonely"],
    opening: "夜里十一点四十分，客厅的灯还亮着，沙发缝里塞着个凉透的杯子。",
    lines: [
      "我刚把手机塞进抽屉最里头那格，够不着，也懒得再伸手。",
      "卫生间咳了两声，我竖起耳朵听了听，没动。",
    ],
    returnLetter: "杯子还在沙发缝里。你要是也扣着手机，先别拿出来。",
    source: "collected",
  },
  {
    id: "c006",
    name: "苏平",
    city: "苏州",
    region: "east",
    feels: ["calm", "tired", "anxious"],
    opening: "凌晨四点半我就醒了，窗外还是那种灰蓝色，楼下早点摊的灯刚亮。",
    lines: [
      "手机扣在床头柜上，屏幕朝下，怕看见未读消息。",
      "水龙头拧开又关上，没想喝，只是想听一会儿水声。",
    ],
    returnLetter: "水龙头我又关了。你要是也扣着屏幕，先听一会儿水。",
    source: "collected",
  },
  {
    id: "c007",
    name: "苏敏",
    city: "苏州",
    region: "east",
    feels: ["gloom", "anxious", "calm"],
    opening: "凌晨一点半，我坐在孩子书桌旁边的小板凳上，听见他翻了下身，替他掖好被角。",
    lines: [
      "客厅的水壶跳了闸，我去按下去，把那张揉皱的卷子抹平放回抽屉。",
      "脏碗冲了一遍又一遍，直到指尖发白。",
    ],
    returnLetter: "那张卷子我抹平了。你要是也还坐着，先按一下水壶。",
    source: "collected",
  },
  {
    id: "c008",
    name: "林野",
    city: "苏州",
    region: "east",
    feels: ["lonely", "tired"],
    opening: "凌晨一点，我坐在厨房地上，冰箱嗡嗡响。",
    lines: [
      "刚把碗洗完，手还是油的，水池边堆着两个没刷的锅。",
      "想找个人说句话，翻了三屏聊天列表，没有一个能现在开口的。",
    ],
    returnLetter: "锅还泡着。你要是也翻完三屏，先躺一下。",
    source: "collected",
  },
  {
    id: "c011",
    name: "林舟",
    city: "重庆",
    region: "east",
    feels: ["calm", "tired"],
    opening: "雨连着落了两晚。第三天早上我没再定闹钟。",
    lines: ["一点十二分醒了。摸了一下手机，屏幕没亮。", "翻个身，又睡着。"],
    returnLetter: "闹钟我没定。你要是也醒过一回，对一下时间。",
    source: "collected",
  },
];
