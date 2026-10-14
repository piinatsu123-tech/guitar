// 新規データの生成とサンプル曲。
import { positionsFromFrets } from "../music/chord";
import { distributeTicks, splitGraphemes } from "../music/lyrics";
import { EIGHTH, SIXTEENTH, TICKS_PER_QUARTER, ticksPerMeasure } from "../music/timeline";
import type { ChordEvent, LyricEvent, RhythmEvent, RhythmPattern, Section, Song } from "./types";

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeLyrics(text: string, duration: number): LyricEvent[] {
  const chars = splitGraphemes(text);
  const ticks = distributeTicks(chars.length, duration, SIXTEENTH);
  return chars.map((t, i) => ({ id: newId(), text: t, startTick: ticks[i], accentMarked: false }));
}

export function makeChord(chordName: string, durationTicks: number, lyrics = ""): ChordEvent {
  return { id: newId(), chordName, durationTicks, lyrics: lyrics ? makeLyrics(lyrics, durationTicks) : [] };
}

export function makeSection(name: string, chords: ChordEvent[] = []): Section {
  return { id: newId(), name, chords };
}

type EventSpec = [start: number, duration: number, kind: RhythmEvent["kind"], action: RhythmEvent["guitarAction"]];

export function makePattern(name: string, lengthTicks: number, specs: EventSpec[]): RhythmPattern {
  return {
    id: newId(),
    name,
    lengthTicks,
    events: specs.map(([startTick, durationTicks, kind, guitarAction]) => ({
      id: newId(),
      startTick,
      durationTicks,
      kind,
      guitarAction,
    })),
  };
}

const Q = TICKS_PER_QUARTER;
const E = EIGHTH;

/** 4/4 用の基本パターン */
export function defaultPatterns(): RhythmPattern[] {
  return [
    makePattern("4分ダウン", 4 * Q, [
      [0, Q, "note", "downstroke"],
      [Q, Q, "note", "downstroke"],
      [2 * Q, Q, "note", "downstroke"],
      [3 * Q, Q, "note", "downstroke"],
    ]),
    makePattern("8ビート（ダウン・アップ）", 4 * Q, [
      [0, E, "note", "downstroke"],
      [E, E, "note", "upstroke"],
      [2 * E, E, "note", "downstroke"],
      [3 * E, E, "note", "upstroke"],
      [4 * E, E, "note", "downstroke"],
      [5 * E, E, "note", "upstroke"],
      [6 * E, E, "note", "downstroke"],
      [7 * E, E, "note", "upstroke"],
    ]),
    // ↓ ↓↑ (伸ばす) ↑ ↓↑ のような定番パターン：3拍目頭は音を伸ばして弾かない
    makePattern("ダウン・ダウンアップ・アップダウン", 4 * Q, [
      [0, Q, "note", "downstroke"],
      [Q, E, "note", "downstroke"],
      [Q + E, E, "note", "upstroke"],
      [2 * Q, E, "note", "none"],
      [2 * Q + E, E, "note", "upstroke"],
      [3 * Q, E, "note", "downstroke"],
      [3 * Q + E, E, "note", "upstroke"],
    ]),
    makePattern("全音符（1回ジャーン）", 4 * Q, [[0, 4 * Q, "note", "downstroke"]]),
  ];
}

export function createEmptySong(title = "新しい曲"): Song {
  const now = new Date().toISOString();
  const patterns = defaultPatterns();
  const m = ticksPerMeasure({ numerator: 4, denominator: 4 });
  return {
    id: newId(),
    title,
    tempo: 90,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [makeSection("Aメロ", [makeChord("C", m), makeChord("G", m), makeChord("Am", m), makeChord("Em", m)])],
    forms: [],
    rhythmPatterns: patterns,
    defaultRhythmPatternId: patterns[0].id,
    createdAt: now,
    updatedAt: now,
  };
}

/** 動作確認用のサンプル曲（コード進行・歌詞はオリジナル） */
export function createSampleSong(): Song {
  const now = new Date().toISOString();
  const patterns = defaultPatterns();
  const m = 4 * Q;
  const h = 2 * Q;
  const verse = makeSection("Aメロ", [
    makeChord("C", m, "あさのひかりが"),
    makeChord("G", m, "まどをたたく"),
    makeChord("Am", h, "ねむい"),
    makeChord("Em", h, "めをこすり"),
    makeChord("F", m, "ゆっくりと"),
    makeChord("C", m, "おきあがる"),
    makeChord("Dm", m, "いつもの"),
    makeChord("G7", m, "みちへ"),
  ]);
  const bridge = makeSection("Bメロ", [
    makeChord("F", m, "かぜがふけば"),
    makeChord("G", m, "せなかおす"),
    makeChord("Em", m, "あるきだせば"),
    makeChord("Am", m, "うたになる"),
    makeChord("Dm", m),
    makeChord("G", m),
    makeChord("Cmaj7", m),
    makeChord("C", m),
  ]);
  bridge.rhythmPatternId = patterns[1].id;
  const chorus = makeSection("サビ", [
    makeChord("C", m, "ひかりのなかへ"),
    makeChord("G", m, "かけていこう"),
    makeChord("Am", m, "まだしらない"),
    makeChord("F", m, "あしたへと"),
    makeChord("C", m, "こえをあわせ"),
    makeChord("G", m, "うたおうよ"),
    makeChord("F", h, "いま"),
    makeChord("G", h, "ここで"),
    makeChord("C", m),
  ]);
  chorus.rhythmPatternId = patterns[2].id;
  // 歌詞の行の区切り（歌詞とコードの表示で使う）
  for (const [sec, ends] of [
    [verse, [1, 3, 5, 7]],
    [bridge, [1, 3, 7]],
    [chorus, [1, 3, 5, 8]],
  ] as const)
    for (const i of ends) sec.chords[i].lineBreak = true;
  // リズム譜の例（コードとは切り離したリズムだけの譜）
  for (const [sec, p] of [
    [verse, patterns[0]],
    [chorus, patterns[2]],
  ] as const)
    if (p.lengthTicks % m === 0)
      sec.lineRhythms = [{ line: 0, events: p.events.map((e) => ({ ...e, id: newId() })), lengthTicks: p.lengthTicks }];
  // 演奏タイミングのマーク例：各コードの最初の文字
  for (const s of [verse, chorus]) {
    for (const c of s.chords) {
      if (c.lyrics.length) c.lyrics[0].accentMarked = true;
    }
  }
  const fForm = { id: newId(), chordName: "F", positions: positionsFromFrets([1, 3, 3, 2, 1, 1]) };
  for (const s of [verse, bridge, chorus]) {
    for (const c of s.chords) if (c.chordName === "F") c.formId = fForm.id;
  }
  return {
    id: newId(),
    title: "サンプル：あさのうた",
    tempo: 96,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [verse, bridge, chorus],
    forms: [fForm],
    rhythmPatterns: patterns,
    defaultRhythmPatternId: patterns[0].id,
    createdAt: now,
    updatedAt: now,
  };
}
