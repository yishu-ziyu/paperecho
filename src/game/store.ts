import { create } from "zustand";
import {
  advanceExchange,
  fallbackReturnLetter,
  initialExchange,
  isSilentUnlock,
  SEAL_CLIENT_TIMEOUT_MS,
  shouldSealNow,
  type ExchangeState,
} from "./agent/exchange";
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
import {
  companionFromJourney,
  journeyForName,
  lockedEchoForMatch,
  makeCompanion,
  rememberNight,
} from "./companion";
import {
  loadDaybook,
  nightLine,
  openingLine,
  pulseHeartbeat,
  recordTalk,
  persistDaybook,
  todayStamp,
} from "./heartbeat";
import { buildJourney, fallbackEcho, letterFromChips } from "./kernel";
import {
  clearSnapshot,
  loadJourneys,
  loadMuted,
  loadSnapshot,
  persistJourneys,
  persistMuted,
  saveSnapshot,
  SNAP_VERSION,
  type JourneySnapshot,
} from "./save";
import { speakAway, speakDay, speakGreet, speakTurn } from "./voice";
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
  waitingSince: number;
  seekName: string | null;
  setTokens: (tokens: TokenPos[]) => void;
  commitOrbit: () => void;
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
  abortFlight: () => void;
  goArchive: () => void;
  goBack: () => void;
  startNew: () => void;
  seekPerson: (name: string) => void;
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
  extra: { playerLine?: string; days?: { date: string; text: string }[] } = {},
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
    days: extra.days ?? (s.echo?.name ? loadDaybook(undefined, s.echo.name)?.days : undefined),
  };
}

const savedSnapshot = loadSnapshot();

/**
 * 把落盘快照还原成可继续的初始状态。异步等待段回不来：
 * flight 匹配中 → 退回发射前（信与地区保留）；encounter 等回复 → 放平等待标志，
 * seal 已提交但结果丢了 → 直接进回信。
 */
function resumeOf(snap: JourneySnapshot | null): Partial<GameState> {
  if (!snap) return {};
  const base: Partial<GameState> = {
    tokens: snap.tokens,
    fingerprint: snap.fingerprint,
    selectedMirror: snap.selectedMirror,
    personaHint: snap.personaHint,
    chips: snap.chips,
    letterChips: snap.letterChips,
    extraLine: snap.extraLine,
    folds: snap.folds,
    region: snap.region,
    throwPower: snap.throwPower,
    echo: snap.echo,
    round: snap.round,
    replies: snap.replies,
    chosenReplies: snap.chosenReplies,
    recall: snap.recall,
    session: snap.session,
    core: snap.core,
    exchange: snap.exchange,
  };
  if (snap.phase === "flight" && snap.searching) {
    return { ...base, phase: "throw", searching: false, echo: null, searchNote: "", waitingSince: 0 };
  }
  if (snap.phase === "encounter" && snap.waitingEcho) {
    if (snap.exchange && shouldSealNow(snap.exchange)) {
      return { ...base, phase: "return", waitingEcho: false, waitingSince: 0 };
    }
    return { ...base, waitingEcho: false, waitingSince: 0 };
  }
  return {
    ...base,
    phase: snap.phase,
    searching: snap.searching,
    searchNote: snap.searchNote,
    waitingEcho: snap.waitingEcho,
    waitingSince: 0,
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
  muted: loadMuted(),
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
  waitingSince: 0,
  seekName: null,
  ...resumeOf(savedSnapshot),

  setTokens: (tokens) => set({ tokens, fingerprint: fingerprintOf(tokens) }),

  commitOrbit: () => {
    const fp = fingerprintOf(get().tokens);
    set({
      fingerprint: fp,
      chips: chipPool(fp),
      replies: replyPool(fp),
    });
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
    const seekName = s.seekName;
    const locked = lockedEchoForMatch(s.journeys, seekName);
    const lastNight = locked ? journeyForName(s.journeys, locked.name) : undefined;
    const metNames = s.journeys.map((j) => j.echo.name).filter(Boolean);
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
      waitingSince: Date.now(),
      session: "",
      exchange: initialExchange(),
      seekName: null,
    });
    const letter = letterFromChips(s.letterChips, s.extraLine, s.selectedMirror ?? "");
    void (async () => {
      const book = locked
        ? await pulseHeartbeat(new Date(), s.journeys, undefined, speakDay, locked.name)
        : null;
      const local = locked ?? fallbackEcho(s.fingerprint, dest, metNames);
      try {
        const res = await Promise.race([
          runMatch({
            data: {
              ...agentPayload(
                {
                  ...s,
                  archival,
                  session: "",
                  echo: locked,
                  recall: lastNight?.transcript ?? [],
                },
                { days: book?.days },
              ),
              letter,
              region: dest,
              echo: locked,
              avoidNames: metNames,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 40000),
          ),
        ]);
        if (get().phase !== "flight") return;
        sfxMatch();
        const live = res.echo;
        const greeting = openingLine(
          live.greeting,
          book,
          lastNight ? companionFromJourney(lastNight).lastEcho : local.greeting,
        );
        const grown = applyFacts(archival, res.facts, {
          emotions: ownedOf(s.fingerprint, 0.3).map((f) => f.id),
          region: dest,
          echoName: locked?.name ?? live.name,
        });
        persistArchival(grown);
        set({
          echo: { ...live, name: locked?.name ?? live.name, city: locked?.city ?? live.city, greeting },
          core: res.core,
          archival: grown,
          suggestions: [],
          hits: res.hits,
          meter: res.meter,
          session: res.session,
          exchange: res.exchange ?? initialExchange(),
          recall: greeting.trim() ? [{ who: "echo", text: greeting }] : [],
          searching: false,
          waitingSince: 0,
          searchNote: `到了 ${live.city}，${live.name} 读完了你的信`,
        });
      } catch {
        if (get().phase !== "flight") return;
        const companion = lastNight ? companionFromJourney(lastNight) : null;
        const greeted = locked
          ? await speakGreet({
              name: locked.name,
              city: locked.city,
              lastEcho: companion?.lastEcho || "",
              lastYou: companion?.lastYou || "",
              lastEmotions: companion?.lastEmotions ?? [],
              letter,
              days: book?.days,
            })
          : null;
        const greeting = openingLine(greeted, book, companion?.lastEcho || local.greeting);
        const echo = { ...local, greeting };
        set({
          echo,
          core: {
            human: "",
            persona: companion
              ? `你是${echo.name}，在${echo.city}。你还是上次那个人。离开后你自己过了：「${companion.awayThing}」。`
              : `你是${echo.name}，在${echo.city}。`,
          },
          suggestions: [],
          meter: emptyMeter(),
          recall: greeting.trim() ? [{ who: "echo", text: greeting }] : [],
          searching: false,
          waitingSince: 0,
          searchNote: companion
            ? `到了 ${echo.city}，${echo.name} 读完了你的信`
            : "线路不稳，改从本地故事里取一封相近的信",
        });
      }
    })();
  },

  reply: (text) => {
    const s = get();
    if (s.waitingEcho) return;
    const priorPlayer = s.recall.filter((t) => t.who === "you").map((t) => t.text);
    const lastEcho = s.recall.filter((t) => t.who === "echo").at(-1)?.text ?? "";
    const prevEx = s.exchange;
    const step = advanceExchange(prevEx, text, priorPlayer, lastEcho);
    const round = s.round + 1;
    const chosen = [...s.chosenReplies, text];
    const recall = [...s.recall, { who: "you" as const, text }];
    const silentUnlock = isSilentUnlock(prevEx, step);

    const beginSeal = () => {
      set({ waitingEcho: true, waitingSince: Date.now(), searchNote: "回信正在折回来" });
      const cur = get();
      void Promise.race([
        runSeal({ data: agentPayload(cur, { playerLine: text }) }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), SEAL_CLIENT_TIMEOUT_MS),
        ),
      ])
        .then((res) => {
          if (get().phase !== "encounter") return;
          const echo = get().echo;
          if (!echo) return;
          const fallback = fallbackReturnLetter(text);
          const base = get();
          const grown = applyFacts(base.archival, res.facts, {
            emotions: ownedOf(base.fingerprint, 0.3).map((f) => f.id),
            region: base.region ?? "east",
            echoName: echo.name,
          });
          persistArchival(grown);
          set({
            echo: {
              ...echo,
              returnLetter: ownLine(res.returnLetter || fallback, [fallback, echo.greeting], base.archival, [
                echo.returnLetter,
              ]),
            },
            archival: grown,
            session: res.session,
            meter: res.meter,
            waitingEcho: false,
            waitingSince: 0,
            phase: "return",
          });
        })
        .catch(() => {
          if (get().phase !== "encounter") return;
          const echo = get().echo;
          if (!echo) {
            set({ waitingEcho: false, waitingSince: 0 });
            return;
          }
          set({
            echo: { ...echo, returnLetter: fallbackReturnLetter(text) },
            waitingEcho: false,
            waitingSince: 0,
            phase: "return",
          });
        });
    };

    if (shouldSealNow(prevEx)) {
      set({
        chosenReplies: chosen,
        round,
        recall,
        waitingEcho: true,
        searchNote: "回信正在折回来",
      });
      beginSeal();
      return;
    }

    set({
      chosenReplies: chosen,
      round,
      recall,
      waitingEcho: true,
      waitingSince: Date.now(),
    });
    void Promise.race([
      runTurn({ data: agentPayload({ ...s, recall, round, exchange: prevEx }, { playerLine: text }) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 40000),
      ),
    ])
      .then(async (res) => {
        if (get().phase !== "encounter") return;
        const echo = get().echo;
        if (!echo) return;
        const book = loadDaybook(undefined, echo.name);
        let spoken = nightLine(res.spoken, lastEcho, book);
        if (!spoken) {
          const again = await speakTurn({
            name: echo.name,
            city: echo.city,
            lastEcho,
            lastYou: text,
            lastEmotions: ownedOf(get().fingerprint).map((f) => f.id),
            letter: text,
            days: book?.days,
          });
          spoken = nightLine(again, lastEcho, book);
        }
        if (!spoken) {
          set({ waitingEcho: false });
          return;
        }
        const base = get();
        const grown = applyFacts(base.archival, res.facts, {
          emotions: ownedOf(base.fingerprint, 0.3).map((f) => f.id),
          region: base.region ?? "east",
          echoName: echo.name,
        });
        persistArchival(grown);
        set({
          echo: { ...echo, replies: [...echo.replies, spoken] },
          archival: grown,
          suggestions: [],
          hits: res.hits,
          meter: res.meter,
          session: res.session,
          exchange: res.exchange ?? step.state,
          recall: [...get().recall, { who: "echo", text: spoken }],
          waitingEcho: silentUnlock,
          waitingSince: silentUnlock ? Date.now() : 0,
          searchNote: silentUnlock ? "回信正在折回来" : get().searchNote,
        });
        if (silentUnlock) beginSeal();
      })
      .catch(() => {
        if (get().phase !== "encounter") return;
        const echo = get().echo;
        if (!echo) {
          set({ waitingEcho: false, waitingSince: 0 });
          return;
        }
        const spoken = nightLine("", lastEcho, loadDaybook(undefined, echo.name));
        if (!spoken) {
          set({ waitingEcho: false });
          return;
        }
        set({
          echo: { ...echo, replies: [...echo.replies, spoken] },
          exchange: step.state,
          recall: [...get().recall, { who: "echo", text: spoken }],
          waitingEcho: silentUnlock,
          waitingSince: silentUnlock ? Date.now() : 0,
          searchNote: silentUnlock ? "回信正在折回来" : get().searchNote,
        });
        if (silentUnlock) beginSeal();
      });
  },

  saveReturn: () => {
    const s = get();
    if (!s.echo || !s.region) return;
    const letter = letterFromChips(s.letterChips, s.extraLine, s.selectedMirror ?? "");
    const grown = makeCompanion({
      echo: s.echo,
      transcript: s.recall,
      fingerprint: ownedOf(s.fingerprint),
      letter,
    });
    const remembered = rememberNight({
      echo: s.echo,
      transcript: s.recall,
      fingerprint: ownedOf(s.fingerprint),
      letter,
    });
    const journey = buildJourney({
      fingerprint: ownedOf(s.fingerprint),
      mirror: s.selectedMirror ?? "",
      letter,
      chips: s.letterChips,
      region: s.region,
      echo: remembered.echo,
      transcript: s.recall,
      returnLetter: remembered.echo.returnLetter,
      awayThing: remembered.awayThing,
    });
    const journeys = [journey, ...s.journeys].slice(0, 24);
    persistJourneys(journeys);
    const companion = makeCompanion({
      echo: remembered.echo,
      transcript: s.recall,
      fingerprint: ownedOf(s.fingerprint),
      letter,
      awayThing: remembered.awayThing,
    });
    const talk = {
      name: companion.name,
      city: companion.city,
      lastEcho: companion.lastEcho,
      lastYou: companion.lastYou,
      lastEmotions: companion.lastEmotions,
      page: remembered.awayThing,
    };
    void recordTalk(loadDaybook(undefined, companion.name), talk, todayStamp(), speakDay).then(
      persistDaybook,
    );
    void speakAway({
      name: grown.name,
      city: grown.city,
      lastEcho: grown.lastEcho,
      lastYou: grown.lastYou,
      lastEmotions: grown.lastEmotions,
      letter,
      days: loadDaybook(undefined, grown.name)?.days,
    }).then((spoken) => {
      if (!spoken) return;
      void recordTalk(loadDaybook(undefined, companion.name), { ...talk, page: spoken }, todayStamp()).then(
        persistDaybook,
      );
    });
    const playerBits = keepPlayerFacts([], [letter, s.extraLine, ...s.letterChips, ...s.chosenReplies]);
    const archival = applyFacts(s.archival, playerBits, {
      emotions: ownedOf(s.fingerprint, 0.3).map((f) => f.id),
      region: s.region,
      echoName: s.echo.name,
    });
    persistArchival(archival);
    clearSnapshot();
    set({ journeys, archival, phase: "archive", reading: journey, leftFrom: null });
  },

  abortFlight: () => {
    const s = get();
    if (s.phase !== "flight") return;
    set({
      phase: "throw",
      searching: false,
      echo: null,
      searchNote: "",
      waitingEcho: false,
      waitingSince: 0,
    });
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
    clearSnapshot();
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
      waitingSince: 0,
      session: "",
      scorch: 0,
      exchange: initialExchange(),
      judgeOpen: false,
      seekName: null,
    });
  },
  seekPerson: (name) => {
    get().startNew();
    const who = name.trim();
    if (who) set({ seekName: who });
  },
  openJourney: (j) => set({ reading: j, phase: "archive" }),
  setMutedFlag: (v) => {
    persistMuted(v);
    set({ muted: v });
  },
  toggleJudge: () => {
    if (get().phase === "encounter") return;
    set({ judgeOpen: !get().judgeOpen });
  },
  goThrow: () => set({ phase: "throw" }),
  arrive: () => set({ phase: "encounter", round: 0, judgeOpen: false }),
  markScorch: () => set({ scorch: Math.min(2, get().scorch + 1) as 0 | 1 | 2 }),
}));

/** 进行中旅程自动落盘：状态变动后防抖保存，切走页面时立即刷新。 */
let snapshotTimer: number | undefined;

function persistSnapshotNow() {
  const s = useGame.getState();
  if (s.phase === "title" || s.phase === "archive") {
    clearSnapshot();
    return;
  }
  saveSnapshot({
    version: SNAP_VERSION,
    createdAt: Date.now(),
    phase: s.phase,
    tokens: s.tokens,
    fingerprint: s.fingerprint,
    selectedMirror: s.selectedMirror,
    personaHint: s.personaHint,
    chips: s.chips,
    letterChips: s.letterChips,
    extraLine: s.extraLine,
    folds: s.folds,
    region: s.region,
    throwPower: s.throwPower,
    echo: s.echo,
    searching: s.searching,
    searchNote: s.searchNote,
    round: s.round,
    replies: s.replies,
    chosenReplies: s.chosenReplies,
    recall: s.recall,
    waitingEcho: s.waitingEcho,
    session: s.session,
    core: s.core,
    exchange: s.exchange,
  });
}

function scheduleSnapshot() {
  if (snapshotTimer !== undefined) return;
  snapshotTimer = window.setTimeout(() => {
    snapshotTimer = undefined;
    persistSnapshotNow();
  }, 400);
}

useGame.subscribe(() => scheduleSnapshot());

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    if (snapshotTimer !== undefined) {
      window.clearTimeout(snapshotTimer);
      snapshotTimer = undefined;
    }
    persistSnapshotNow();
  });
}
