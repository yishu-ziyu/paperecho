import type { EmotionId, RegionId, Story } from "./types";

export const REGIONS: {
  id: RegionId;
  label: string;
  city: string;
  lat: number;
  lng: number;
}[] = [
  { id: "east", label: "东亚", city: "杭州", lat: 31.2, lng: 121.5 },
  { id: "america", label: "美洲", city: "芝加哥", lat: 40.7, lng: -74 },
  { id: "europe", label: "欧洲", city: "里斯本", lat: 48.8, lng: 2.3 },
  { id: "africa", label: "非洲", city: "内罗毕", lat: -1.3, lng: 36.8 },
  { id: "oceania", label: "南半球", city: "奥克兰", lat: -36.8, lng: 174.7 },
  { id: "polar", label: "极夜", city: "特罗姆瑟", lat: 69.6, lng: 18.9 },
];

export function regionLabel(id: RegionId | string): string {
  return REGIONS.find((r) => r.id === id)?.label ?? id;
}

export const STORIES: Story[] = [
  {
    id: "s1",
    name: "林予",
    city: "杭州",
    region: "east",
    feels: ["unseen", "tired", "gloom"],
    opening: "我改了十七稿方案，群里只回了一句收到。灯还开着，像在等一个不存在的点头。",
    lines: [
      "十七稿我打成一包，塞进抽屉最下层。",
      "那句收到我到现在都没回。",
    ],
    returnLetter: "抽屉那包还在。你要是也有一包，先别扔。",
  },
  {
    id: "s2",
    name: "Mara",
    city: "Lisbon",
    region: "europe",
    feels: ["lonely", "gloom", "calm"],
    opening: "港口的灯很多，可没有一盏是为我亮的。我还是会把窗打开，假装有人会进来坐。",
    lines: [
      "窗开着。我在群里打了又删。",
      "删掉的那句是：我今天其实不太好。",
    ],
    returnLetter: "窗还开着。你那句要是还在草稿箱，先别清。",
  },
  {
    id: "s3",
    name: "Jonah",
    city: "Chicago",
    region: "america",
    feels: ["anxious", "tired", "unseen"],
    opening: "我把明天预演了四遍，每一遍都搞砸。现在凌晨三点，清单还在闪。",
    lines: [
      "清单第四条我写了又划掉。现在三点。",
      "别人说放轻松。门上没把手。",
    ],
    returnLetter: "清单我没关。你那条「如果搞砸了呢」我抄在便利贴上，没写别的。",
  },
  {
    id: "s4",
    name: "阿宁",
    city: "成都",
    region: "east",
    feels: ["wronged", "anger", "unseen"],
    opening: "我把最好的那面都给出去了，换来一句还好。我笑了，牙关却咬着。",
    lines: [
      "我回家把那句还好从聊天里删了。",
      "笑是笑了。牙关没松。",
    ],
    returnLetter: "那句还好我没留。你要是也截过图，咱们对一下时间。",
  },
  {
    id: "s5",
    name: "Sefu",
    city: "Nairobi",
    region: "africa",
    feels: ["tired", "calm", "lonely"],
    opening: "白天把声音都用完了。夜里只剩下风扇和一句没说完的话。",
    lines: [
      "风扇一直转。那句话我没说完。",
      "我靠着椅背坐了很久。手机还在手里。",
    ],
    returnLetter: "风扇还在响。你那句没说完的，要是还在嘴边，先放着。",
  },
  {
    id: "s6",
    name: "Hana",
    city: "Auckland",
    region: "oceania",
    feels: ["lonely", "unseen", "gloom"],
    opening: "这里白天很长。长到我有足够的时间怀疑：我是不是隐身了。",
    lines: [
      "群里那条我删了三次。第三次是真的。",
      "白天太长。我把窗边的灯开着，没告诉谁。",
    ],
    returnLetter: "灯还开着。你草稿箱里要是也有一条，先别发出去也别删。",
  },
  {
    id: "s7",
    name: "Iris",
    city: "Tromsø",
    region: "polar",
    feels: ["gloom", "calm", "lonely"],
    opening: "极夜里，时间不像时间。我把一封没写完的信放了三个星期。",
    lines: [
      "那封信放了三个星期。开头两个字都没定。",
      "极夜里钟不准。我把草稿又翻出来了。",
    ],
    returnLetter: "草稿还在桌面。文件名是 letter_wip。你要是也有一份，对一下日期。",
  },
  {
    id: "s8",
    name: "Diego",
    city: "Valparaíso",
    region: "america",
    feels: ["anger", "wronged", "anxious"],
    opening: "山上的风很大。我把怒气折进衣领里，假装那只是天气。",
    lines: [
      "风很大。怒气我折进衣领里了。",
      "他们说我太敏感。我在坡上站了一会儿。",
    ],
    returnLetter: "衣领还是热的。你要是也把火折起来了，先别展开给我看，说一声就行。",
  },
  {
    id: "s9",
    name: "美咲",
    city: "札幌",
    region: "east",
    feels: ["anxious", "lonely", "gloom"],
    opening: "电车上每个人都在看屏幕。我看着自己的倒影，练习正常的表情。",
    lines: [
      "电车上我对着玻璃练「没事」。",
      "焦虑让我很会说没事。练习次数我没数。",
    ],
    returnLetter: "没事我今天说了四回。你要是也在练，咱们对一下次数。",
  },
  {
    id: "s10",
    name: "Leila",
    city: "Marrakesh",
    region: "africa",
    feels: ["wronged", "tired", "unseen"],
    opening: "我把家里的事一件件托好，没有人问托的人累不累。",
    lines: [
      "家里的事我一件件托着。没人问托的人。",
      "茶壶我放了又拿起来。",
    ],
    returnLetter: "茶壶现在在桌上。你要是也托着什么，先数一数件数，别先解释。",
  },
  {
    id: "s11",
    name: "Owen",
    city: "Edinburgh",
    region: "europe",
    feels: ["calm", "gloom", "tired"],
    opening: "雨停了。我还好。还好里面有一块想被轻轻说出来的地方。",
    lines: [
      "雨停了。我还坐着。",
      "还好。我把这两个字打出来又删了。",
    ],
    returnLetter: "还好我又打了一遍，没删。你要是也打过，截个屏也行。",
  },
  {
    id: "s12",
    name: "Priya",
    city: "Melbourne",
    region: "oceania",
    feels: ["unseen", "anxious", "wronged"],
    opening: "答辩结束了。没有人记得我改到凌晨的那几页。我开始怀疑那些页是不是真的存在过。",
    lines: [
      "那几页叫 appendix_v7。答辩当天U盘没插上。",
      "导师问了三个摘要里的问题。后面我一个字没提。",
    ],
    returnLetter: "v7 我没删。你那几页要是还在文件夹里，也先别清。",
  },
];

export function matchStories(feels: EmotionId[], n = 3, avoid: string[] = []): Story[] {
  const ranked = [...STORIES].sort((a, b) => {
    const oa = a.feels.filter((f) => feels.includes(f)).length;
    const ob = b.feels.filter((f) => feels.includes(f)).length;
    if (ob !== oa) return ob - oa;
    return a.id.localeCompare(b.id);
  });
  const skip = new Set(avoid.filter(Boolean));
  const out: Story[] = [];
  const regions = new Set<RegionId>();
  const take = (ignoreRegion: boolean, ignoreAvoid: boolean) => {
    for (const s of ranked) {
      if (out.includes(s)) continue;
      if (!ignoreAvoid && skip.has(s.name)) continue;
      if (!ignoreRegion && regions.has(s.region)) continue;
      out.push(s);
      regions.add(s.region);
      if (out.length >= n) return;
    }
  };
  take(false, false);
  if (out.length < n) take(true, false);
  if (out.length < n) take(true, true);
  return out.slice(0, n);
}

export function matchStoriesTagged(
  feels: EmotionId[],
  n = 3,
  avoid: string[] = [],
): { story: Story; matchedBy: EmotionId }[] {
  return matchStories(feels, n, avoid).map((story) => ({
    story,
    matchedBy: story.feels.find((f) => feels.includes(f)) ?? story.feels[0]!,
  }));
}

export function matchStory(
  feels: EmotionId[],
  region: RegionId,
): Story {
  let best = STORIES[0];
  let score = -1;
  for (const s of STORIES) {
    const overlap = s.feels.filter((f) => feels.includes(f)).length;
    const bonus = s.region === region ? 1.4 : 0;
    const n = overlap * 2 + bonus;
    if (n > score) {
      score = n;
      best = s;
    }
  }
  return best;
}

export function storyToEcho(story: Story): import("./types").EchoPerson {
  return {
    name: story.name,
    city: story.city,
    felt: story.feels.join(","),
    greeting: story.opening,
    replies: [story.opening, story.lines[0], story.lines[1]],
    returnLetter: story.returnLetter,
    source: "archive",
  };
}

export function foreignPlace(text: string, name: string, city: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return STORIES.some((s) => (s.name !== name && t.includes(s.name)) || (s.city !== city && t.includes(s.city)));
}
