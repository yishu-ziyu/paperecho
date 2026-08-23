import { create } from "zustand";
import { initialExchange, type ExchangeState } from "./agent/exchange";
import { applyFacts, factsOf, keepPlayerFacts, loadArchival, ownLine, persistArchival } from "./agent/memory";
import { runMatch, runSeal, runTurn } from "./agent/server";
import type { AgentPayload } from "./agent/server";
import { sfxMatch } from "./audio";
import {
  chipPool,
  fingerprintOf,
  ownedOf,
  replyPool,
  seedTokens,
} from "./emotions";
import { buildJourney, fallbackEcho, letterFromChips } from "./kernel";
import { loadJourneys, persistJourneys } from "./save";
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
  matchedBy: Partial<Record<string, import("./types").EmotionId>>;
  selectedMirror: string | null;
  personaHint: string;
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
  scorch: 0 | 1 | 2;
  exchange: ExchangeState;
  setTokens: (tokens: TokenPos[]) => void;
  commitOrbit: () => void;
  pickMirror: (storyId: string) => void;
  writeMirror: (text: string) => void;
  commitListen: (text: string, persona?: string) => void;
  setPersonaHint: (hint: string) => void;
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
  goThrow: () => void;
  arrive: () => void;
  markScorch: () => void;
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
    personaHint?: string;
    archival: MemoryRecord[];
    core: CoreMemory;
    recall: { who: "you" | "echo"; text: string }[];
    round: number;
    echo: EchoPerson | null;
    journeys: Journey[];
    session?: string;
    exchange?: ExchangeState;
  },
  extra: { playerLine?: string } = {},
): AgentPayload {
  return {
    fingerprint: s.fingerprint,
    letter: letterFromChips(s.letterChips, s.extraLine, s.selectedMirror ?? ""),
    region: s.region ?? "east",
    mirror: s.selectedMirror ?? "",
    playerPersona: s.personaHint ?? "",
    archival: s.archival,
    core: s.core,
    recall: s.recall,
    playerLine: extra.playerLine ?? "",
    round: s.round,
    echo: s.echo,
    avoidNames: s.journeys.map((j) => j.echo.name).filter(Boolean).slice(0, 8),
    session: s.session ?? "",
    exchange: s.exchange ?? initialExchange(),
  };
}

export const useGame = create<GameState>((set, get) => ({
  phase: "title",
  leftFrom: null,
  tokens: seedTokens(),
  fingerprint: [],
  candidates: [],
  matchedBy: {},
  selectedMirror: null,
  personaHint: "",
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
  scorch: 0,
  exchange: initialExchange(),

  setTokens: (tokens) => set({ tokens, fingerprint: fingerprintOf(tokens) }),

  commitOrbit: () => {
    const fp = fingerprintOf(get().tokens);
    set({
      fingerprint: fp,
      chips: chipPool(fp),
      replies: replyPool(fp),
    });
  },

  pickMirror: () => {
    /* 倾听同屏后不再走选卡镜认。文件仍留着，避免 Scene Record 崩。 */
  },

  writeMirror: (text) => {
    get().commitListen(text, get().personaHint);
  },

  setPersonaHint: (hint) => set({ personaHint: hint }),

  commitListen: (text, persona) => {
    const line = text.trim().slice(0, 56);
    if (line.length < 4) return;
    const fp = fingerprintOf(get().tokens);
    const hint = (persona ?? get().personaHint).trim();
    set({
      fingerprint: fp,
      selectedMirror: line,
      personaHint: hint,
      echo: null,
      chips: chipPool(fp),
      replies: replyPool(fp),
      letterChips: [],
      extraLine: "",
      folds: 0,
      candidates: [],
      matchedBy: {},
      phase: "fold",
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
    set({
      throwPower: power,
      phase: "flight",
      searching: true,
      searchNote: "寻找世另我ing",
      echo: null,
      archival,
      recall: [],
      scorch: 0,
      suggestions: [],
      hits: [],
      waitingEcho: false,
      session: "",
      exchange: initialExchange(),
    });
    const letter = letterFromChips(s.letterChips, s.extraLine, s.selectedMirror ?? "");
    const local = fallbackEcho(s.fingerprint, dest);
    void Promise.race([
      runMatch({
        data: {
          ...agentPayload({ ...s, archival, session: "", echo: null }),
          letter,
          region: dest,
          echo: null,
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
        const greeting = live.greeting?.trim() || local.greeting;
        set({
          echo: { ...live, greeting },
          core: res.core,
          suggestions: [],
          hits: res.hits,
          meter: res.meter,
          session: res.session,
          exchange: res.exchange ?? initialExchange(),
          recall: [{ who: "echo", text: greeting }],
          searching: false,
          searchNote: `到了 ${live.city}，${live.name} 读完了你的信`,
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
          suggestions: [],
          meter: emptyMeter(),
          recall: [{ who: "echo", text: local.greeting }],
          searching: false,
          searchNote: "线路不稳，改从本地故事里取一封相近的信",
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
        const spoken = res.spoken.trim() || echo.greeting;
        set({
          echo: { ...echo, replies: [...echo.replies, spoken] },
          suggestions: [],
          hits: res.hits,
          meter: res.meter,
          session: res.session,
          exchange: res.exchange ?? get().exchange,
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
    const letter = letterFromChips(s.letterChips, s.extraLine, s.selectedMirror ?? "");
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
      fold: "orbit",
      throw: "fold",
    };
    const next = prev[s.phase];
    if (!next) return;
    set({
      phase: next,
      folds: next === "orbit" ? 0 : s.folds,
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
      matchedBy: {},
      selectedMirror: null,
      personaHint: "",
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
      meter: emptyMeter(),
      core: cabinetCore(),
      archival: loadArchival(),
      recall: [],
      suggestions: [],
      hits: [],
      waitingEcho: false,
      session: "",
      scorch: 0,
      exchange: initialExchange(),
      judgeOpen: false,
    });
  },
  openJourney: (j) => set({ reading: j, phase: "archive" }),
  setMutedFlag: (v) => set({ muted: v }),
  toggleJudge: () => {
    if (get().phase === "encounter") return;
    set({ judgeOpen: !get().judgeOpen });
  },
  goThrow: () => set({ phase: "throw" }),
  arrive: () => set({ phase: "encounter", round: 0, judgeOpen: false }),
  markScorch: () => set({ scorch: Math.min(2, get().scorch + 1) as 0 | 1 | 2 }),
}));
