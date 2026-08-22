import { create } from "zustand";
import { applyFacts, factsOf, keepPlayerFacts, loadArchival, ownLine, persistArchival } from "./agent/memory";
import { runMatch, runSeal, runTurn } from "./agent/server";
import type { AgentPayload } from "./agent/server";
import { sfxMatch } from "./audio";
import {
  chipPool,
  fingerprintOf,
  ownedOf,
  playerHand,
  replyPool,
  seedTokens,
} from "./emotions";
import { buildJourney, fallbackEcho, letterFromChips } from "./kernel";
import { loadJourneys, persistJourneys } from "./save";
import { matchStories, storyToEcho, foreignPlace } from "./stories";
import type {
  CoreMemory,
  EchoPerson,
  Fingerprint,
  Journey,
  MemoryRecord,
  Phase,
  RegionId,
  Story,
  TokenMeter,
  TokenPos,
} from "./types";

interface GameState {
  phase: Phase;
  leftFrom: Phase | null;
  tokens: TokenPos[];
  fingerprint: Fingerprint[];
  candidates: Story[];
  selectedMirror: string | null;
  chips: string[];
  letterChips: string[];
  extraLine: string;
  folds: number;
  region: RegionId | null;
  throwPower: number;
  echo: EchoPerson | null;
  searching: boolean;
  searchNote: string;
  round: number;
  replies: string[];
  chosenReplies: string[];
  meter: TokenMeter | null;
  journeys: Journey[];
  muted: boolean;
  judgeOpen: boolean;
  reading: Journey | null;
  core: CoreMemory;
  archival: MemoryRecord[];
  recall: { who: "you" | "echo"; text: string }[];
  suggestions: string[];
  hits: string[];
  waitingEcho: boolean;
  session: string;
  setTokens: (tokens: TokenPos[]) => void;
  commitOrbit: () => void;
  pickMirror: (storyId: string) => void;
  addChip: (chip: string) => void;
  removeChip: (chip: string) => void;
  setExtra: (line: string) => void;
  foldOnce: () => void;
  pickRegion: (id: RegionId) => void;
  launch: (power: number) => void;
  reply: (text: string) => void;
  saveReturn: () => void;
  goArchive: () => void;
  goBack: () => void;
  startNew: () => void;
  openJourney: (j: Journey) => void;
  setMutedFlag: (v: boolean) => void;
  toggleJudge: () => void;
  startFold: () => void;
  goThrow: () => void;
  arrive: () => void;
}

const emptyMeter = (): TokenMeter => ({
  prompt: 0,
  completion: 0,
  total: 0,
  model: "—",
  via: "archive",
  node: "",
});

const cabinetCore = (): CoreMemory => ({
  human: factsOf(loadArchival()).join("\n"),
  persona: "",
});

function agentPayload(
  s: {
    fingerprint: Fingerprint[];
    letterChips: string[];
    extraLine: string;
    region: RegionId | null;
    selectedMirror: string | null;
    archival: MemoryRecord[];
    core: CoreMemory;
    recall: { who: "you" | "echo"; text: string }[];
    round: number;
    echo: EchoPerson | null;
    journeys: Journey[];
    session?: string;
  },
  extra: { playerLine?: string } = {},
): AgentPayload {
  return {
    fingerprint: s.fingerprint,
    letter: letterFromChips(s.letterChips, s.extraLine),
    region: s.region ?? "east",
    mirror: s.selectedMirror ?? "",
    archival: s.archival,
    core: s.core,
    recall: s.recall,
    playerLine: extra.playerLine ?? "",
    round: s.round,
    echo: s.echo,
    avoidNames: s.journeys.map((j) => j.echo.name).filter(Boolean).slice(0, 8),
    session: s.session ?? "",
  };
}

export const useGame = create<GameState>((set, get) => ({
  phase: "title",
  leftFrom: null,
  tokens: seedTokens(),
  fingerprint: [],
  candidates: [],
  selectedMirror: null,
  chips: [],
  letterChips: [],
  extraLine: "",
  folds: 0,
  region: null,
  throwPower: 0,
  echo: null,
  searching: false,
  searchNote: "",
  round: 0,
  replies: [],
  chosenReplies: [],
  meter: null,
  journeys: loadJourneys(),
  muted: false,
  judgeOpen: false,
  reading: null,
  core: cabinetCore(),
  archival: loadArchival(),
  recall: [],
  suggestions: [],
  hits: [],
  waitingEcho: false,
  session: "",

  setTokens: (tokens) => set({ tokens, fingerprint: fingerprintOf(tokens) }),

  commitOrbit: () => {
    const fp = fingerprintOf(get().tokens);
    const feels = ownedOf(fp, 0.42).map((f) => f.id);
    const avoid = get().journeys.map((j) => j.echo.name).filter(Boolean);
    set({
      fingerprint: fp,
      candidates: matchStories(feels, 3, avoid),
      chips: chipPool(fp),
      replies: replyPool(fp),
      phase: "mirror",
    });
  },

  pickMirror: (storyId) => {
    const story = get().candidates.find((s) => s.id === storyId);
    if (!story) return;
    set({
      selectedMirror: story.opening,
      region: story.region,
      echo: storyToEcho(story),
      chips: chipPool(get().fingerprint),
      replies: [story.lines[0], story.lines[1], story.opening],
      letterChips: [],
      extraLine: "",
      folds: 0,
      phase: "compose",
    });
  },

  addChip: (chip) => {
    const cur = get().letterChips;
    if (cur.includes(chip) || cur.length >= 5) return;
    set({ letterChips: [...cur, chip] });
  },
  removeChip: (chip) =>
    set({ letterChips: get().letterChips.filter((c) => c !== chip) }),
  setExtra: (line) => set({ extraLine: line }),

  foldOnce: () => {
    const n = get().folds + 1;
    set({ folds: n });
  },

  pickRegion: (id) => set({ region: id }),

  launch: (power) => {
    const s = get();
    const dest = s.region ?? "east";
    const archival = loadArchival();
    const pinned = s.echo;
    set({
      throwPower: power,
      phase: "flight",
      searching: true,
      searchNote: pinned ? `飞向 ${pinned.name} · ${pinned.city}` : "在夜里找一个也说过类似话的人",
      echo: pinned,
      archival,
      recall: [],
      suggestions: [],
      hits: [],
      waitingEcho: false,
      session: "",
    });
    const letter = letterFromChips(s.letterChips, s.extraLine);
    const local = pinned ?? fallbackEcho(s.fingerprint, dest);
    void Promise.race([
      runMatch({
        data: {
          ...agentPayload({ ...s, archival, session: "" }),
          letter,
          region: dest,
          echo: pinned,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 22000),
      ),
    ])
      .then((res) => {
        if (get().phase !== "flight") return;
        sfxMatch();
        const live = res.echo;
        const stay = pinned
          ? {
              name: pinned.name,
              city: pinned.city,
              felt: live.felt || pinned.felt,
              greeting: pinned.greeting,
              replies: pinned.replies,
              returnLetter: pinned.returnLetter,
              source: live.source,
            }
          : live;
        const rawGreet = live.greeting || stay.greeting;
        const greeting =
          pinned && (foreignPlace(rawGreet, pinned.name, pinned.city) || !rawGreet)
            ? pinned.greeting
            : ownLine(rawGreet, [stay.greeting, ...stay.replies], get().archival);
        set({
          echo: { ...stay, greeting },
          core: res.core,
          suggestions: playerHand(s.fingerprint, s.chips, [greeting, letter, s.extraLine, ...s.letterChips]),
          hits: res.hits,
          meter: res.meter,
          session: res.session,
          recall: [{ who: "echo", text: greeting }],
          searching: false,
          searchNote: `到了 ${stay.city}，${stay.name} 读完了你的信`,
        });
      })
      .catch(() => {
        if (get().phase !== "flight") return;
        set({
          echo: local,
          core: {
            human: "",
            persona: `你是${local.name}，在${local.city}。`,
          },
          suggestions: playerHand(s.fingerprint, s.chips, [local.greeting, ...s.letterChips, s.extraLine]),
          meter: emptyMeter(),
          recall: [{ who: "echo", text: local.greeting }],
          searching: false,
          searchNote: "线路不稳，改从信柜里取一封相近的旧信",
        });
      });
  },

  reply: (text) => {
    const s = get();
    if (s.waitingEcho) return;
    const round = s.round + 1;
    const chosen = [...s.chosenReplies, text];
    const recall = [...s.recall, { who: "you" as const, text }];
    if (round >= 3) {
      set({
        chosenReplies: chosen,
        round,
        recall,
        waitingEcho: true,
        searchNote: "回信正在折回来",
      });
      void Promise.race([
        runSeal({ data: agentPayload({ ...s, recall, round }, { playerLine: text }) }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 14000),
        ),
      ])
        .then((res) => {
          if (get().phase !== "encounter") return;
          const echo = get().echo;
          if (!echo) return;
          const nextEcho = { ...echo, returnLetter: ownLine(res.returnLetter, [echo.returnLetter, echo.greeting], get().archival) };
          set({
            echo: nextEcho,
            session: res.session,
            meter: res.meter,
            waitingEcho: false,
            phase: "return",
          });
        })
        .catch(() => {
          if (get().phase !== "encounter") return;
          set({ waitingEcho: false, phase: "return" });
        });
      return;
    }

    set({
      chosenReplies: chosen,
      round,
      recall,
      waitingEcho: true,
    });
    void Promise.race([
      runTurn({ data: agentPayload({ ...s, recall, round }, { playerLine: text }) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 12000),
      ),
    ])
      .then((res) => {
        if (get().phase !== "encounter") return;
        const echo = get().echo;
        if (!echo) return;
        const lastEcho = get().recall.filter((t) => t.who === "echo").at(-1)?.text;
        const spoken0 = ownLine(res.spoken, echo.replies, get().archival, get().recall.map((t) => t.text));
        const spoken = foreignPlace(spoken0, echo.name, echo.city)
          ? echo.replies.find((r) => r !== lastEcho && !foreignPlace(r, echo.name, echo.city)) || echo.greeting
          : spoken0;
        const suggestions = playerHand(get().fingerprint, get().chips, [
          spoken,
          ...get().recall.map((t) => t.text),
          ...get().letterChips,
          get().extraLine,
        ]);
        set({
          echo: { ...echo, replies: [...echo.replies, spoken] },
          suggestions: suggestions.length ? suggestions : get().suggestions,
          hits: res.hits,
          meter: res.meter,
          session: res.session,
          recall: [...get().recall, { who: "echo", text: spoken }],
          waitingEcho: false,
        });
      })
      .catch(() => {
        if (get().phase !== "encounter") return;
        const echo = get().echo;
        const line = (get().replies[round] || "我那晚也没睡。电脑还亮着。") as string;
        if (!echo) {
          set({ waitingEcho: false });
          return;
        }
        set({
          echo: { ...echo, replies: [...echo.replies, line] },
          recall: [...get().recall, { who: "echo", text: line }],
          waitingEcho: false,
        });
      });
  },

  saveReturn: () => {
    const s = get();
    if (!s.echo || !s.region) return;
    const letter = letterFromChips(s.letterChips, s.extraLine);
    const journey = buildJourney({
      fingerprint: ownedOf(s.fingerprint),
      mirror: s.selectedMirror ?? "",
      letter,
      chips: s.letterChips,
      region: s.region,
      echo: s.echo,
      transcript: s.recall,
      returnLetter: s.echo.returnLetter,
    });
    const journeys = [journey, ...s.journeys].slice(0, 24);
    persistJourneys(journeys);
    const playerBits = keepPlayerFacts([], [letter, s.extraLine, ...s.letterChips, ...s.chosenReplies]);
    const archival = applyFacts(s.archival, playerBits, {
      emotions: ownedOf(s.fingerprint, 0.3).map((f) => f.id),
      region: s.region,
      echoName: s.echo.name,
    });
    persistArchival(archival);
    set({ journeys, archival, phase: "archive", reading: journey, leftFrom: null });
  },

  goArchive: () => {
    const s = get();
    set({
      leftFrom: s.phase === "archive" ? s.leftFrom : s.phase,
      phase: "archive",
      reading: s.phase === "archive" ? s.reading : null,
    });
  },

  goBack: () => {
    const s = get();
    if (s.phase === "archive") {
      if (s.reading) {
        set({ reading: null });
        return;
      }
      if (s.leftFrom && s.leftFrom !== "archive") {
        set({ phase: s.leftFrom, leftFrom: null });
        return;
      }
      set({ phase: "title" });
      return;
    }
    const prev: Partial<Record<Phase, Phase>> = {
      orbit: "title",
      mirror: "orbit",
      compose: "mirror",
      fold: "compose",
      throw: "fold",
    };
    const next = prev[s.phase];
    if (!next) return;
    set({
      phase: next,
      folds: next === "mirror" ? 0 : s.folds,
    });
  },

  startNew: () => {
    const tokens = seedTokens();
    set({
      phase: "orbit",
      leftFrom: null,
      tokens,
      fingerprint: fingerprintOf(tokens),
      candidates: [],
      selectedMirror: null,
      chips: [],
      letterChips: [],
      extraLine: "",
      folds: 0,
      region: null,
      throwPower: 0,
      echo: null,
      searching: false,
      searchNote: "",
      round: 0,
      replies: [],
      chosenReplies: [],
      reading: null,
      core: cabinetCore(),
      archival: loadArchival(),
      recall: [],
      suggestions: [],
      hits: [],
      waitingEcho: false,
      session: "",
    });
  },
  openJourney: (j) => set({ reading: j, phase: "archive" }),
  setMutedFlag: (v) => set({ muted: v }),
  toggleJudge: () => set({ judgeOpen: !get().judgeOpen }),
  startFold: () => set({ phase: "fold", folds: 0 }),
  goThrow: () => set({ phase: "throw" }),
  arrive: () => set({ phase: "encounter", round: 0 }),
}));
