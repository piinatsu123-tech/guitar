// 音楽上の時間軸。UI から独立し、すべて tick（整数）で計算する。
//
// tick の基準: 4分音符 = 12 tick。
//   16分音符 = 3, 8分音符 = 6, 付点8分 = 9, 4分 = 12, 2分 = 24, 全音符 = 48,
//   3連8分 = 4 なども整数で表せる。
// 1小節の tick 数 = 分子 × (4 / 分母) × 12（例: 4/4 = 48, 3/4 = 36, 6/8 = 36）。
import type { ChordEvent, RhythmEvent, RhythmPattern, Section, Song, TimeSignature } from "../model/types";

export const TICKS_PER_QUARTER = 12;
export const SIXTEENTH = TICKS_PER_QUARTER / 4;
export const EIGHTH = TICKS_PER_QUARTER / 2;

export function ticksPerBeat(ts: TimeSignature): number {
  const t = (TICKS_PER_QUARTER * 4) / ts.denominator;
  if (!Number.isInteger(t)) throw new RangeError(`未対応の拍子: ${ts.numerator}/${ts.denominator}`);
  return t;
}

export function ticksPerMeasure(ts: TimeSignature): number {
  return ts.numerator * ticksPerBeat(ts);
}

export function isValidTimeSignature(ts: TimeSignature): boolean {
  return (
    Number.isInteger(ts.numerator) && ts.numerator >= 1 && ts.numerator <= 16 && [2, 4, 8, 16].includes(ts.denominator)
  );
}

/** 拍数（拍子の分母単位）→ tick */
export function beatsToTicks(beats: number, ts: TimeSignature): number {
  return Math.round(beats * ticksPerBeat(ts));
}

/** tick → 拍数（拍子の分母単位） */
export function ticksToBeats(ticks: number, ts: TimeSignature): number {
  return ticks / ticksPerBeat(ts);
}

export type MusicalPosition = {
  /** 1始まりの小節番号 */
  measure: number;
  /** 1始まりの拍 */
  beat: number;
  /** 拍内の tick */
  tickInBeat: number;
};

/** 絶対 tick を「小節・拍・拍内位置」に変換する */
export function toMusicalPosition(tick: number, ts: TimeSignature): MusicalPosition {
  const m = ticksPerMeasure(ts);
  const b = ticksPerBeat(ts);
  const inMeasure = ((tick % m) + m) % m;
  return {
    measure: Math.floor(tick / m) + 1,
    beat: Math.floor(inMeasure / b) + 1,
    tickInBeat: inMeasure % b,
  };
}

/** 拍内の位置を「1 e & a」形式のラベルにする（16分単位でない位置は空文字） */
export function subdivisionLabel(tickInMeasure: number, ts: TimeSignature): string {
  const b = ticksPerBeat(ts);
  const beat = Math.floor(tickInMeasure / b) + 1;
  const within = tickInMeasure % b;
  if (within === 0) return String(beat);
  if (b === TICKS_PER_QUARTER) {
    if (within === EIGHTH) return "&";
    if (within === SIXTEENTH) return "e";
    if (within === SIXTEENTH * 3) return "a";
  } else if (b === EIGHTH && within === SIXTEENTH) {
    return "&";
  }
  return "";
}

export type PlacedChord = {
  chord: ChordEvent;
  section: Section;
  sectionIndex: number;
  indexInSection: number;
  /** 曲全体の通し番号 */
  globalIndex: number;
  /** 曲頭からの絶対位置 */
  absStart: number;
  /** セクション頭からの位置 */
  sectionStart: number;
};

/** 曲全体のコードを時間軸上に並べる。各セクションは小節頭から始まる。 */
export function layoutSong(song: Song): PlacedChord[] {
  const result: PlacedChord[] = [];
  const m = ticksPerMeasure(song.timeSignature);
  let sectionAbs = 0;
  let globalIndex = 0;
  song.sections.forEach((section, sectionIndex) => {
    let pos = 0;
    section.chords.forEach((chord, indexInSection) => {
      result.push({
        chord,
        section,
        sectionIndex,
        indexInSection,
        globalIndex: globalIndex++,
        absStart: sectionAbs + pos,
        sectionStart: pos,
      });
      pos += chord.durationTicks;
    });
    sectionAbs += Math.ceil(pos / m) * m;
  });
  return result;
}

export type MeasureSlot = {
  chordId: string;
  chordName: string;
  /** 小節内の開始位置 */
  start: number;
  length: number;
  /** 前の小節から続いているコード */
  continued: boolean;
};

/** セクションのコードを小節ごとに分割する（小節をまたぐコードは複数の小節に現れる） */
export function measuresOfSection(section: Section, ts: TimeSignature): MeasureSlot[][] {
  const m = ticksPerMeasure(ts);
  const measures: MeasureSlot[][] = [];
  let pos = 0;
  for (const chord of section.chords) {
    let remaining = chord.durationTicks;
    let cursor = pos;
    let first = true;
    while (remaining > 0) {
      const mi = Math.floor(cursor / m);
      const inM = cursor % m;
      const len = Math.min(remaining, m - inM);
      while (measures.length <= mi) measures.push([]);
      measures[mi].push({ chordId: chord.id, chordName: chord.chordName, start: inM, length: len, continued: !first });
      first = false;
      cursor += len;
      remaining -= len;
    }
    pos += chord.durationTicks;
  }
  return measures;
}

export function findPattern(song: Song, id: string | undefined): RhythmPattern | undefined {
  return id ? song.rhythmPatterns.find((p) => p.id === id) : undefined;
}

/** コード → セクション → 曲の既定 の順にリズムパターンを解決する */
export function resolveRhythmPattern(song: Song, section: Section, chord: ChordEvent): RhythmPattern | undefined {
  return (
    findPattern(song, chord.rhythmPatternId) ??
    findPattern(song, section.rhythmPatternId) ??
    findPattern(song, song.defaultRhythmPatternId)
  );
}

export type PlacedRhythmEvent = RhythmEvent & {
  /** 範囲の先頭で切られ、前から続いている音 */
  clippedStart: boolean;
  /** 範囲の末尾で切られ、後ろへ続く音 */
  clippedEnd: boolean;
};

/**
 * パターンを絶対位置 absStart から length の範囲に敷き詰める。
 * パターンの位相は曲頭（= 小節頭）基準なので、拍の途中から始まるコードでも拍との対応は崩れない。
 * 返す startTick は範囲の先頭（absStart）からの相対位置。
 */
export function tilePattern(pattern: RhythmPattern, absStart: number, length: number): PlacedRhythmEvent[] {
  const L = pattern.lengthTicks;
  if (L <= 0 || length <= 0) return [];
  const result: PlacedRhythmEvent[] = [];
  const end = absStart + length;
  const firstCycle = Math.floor(absStart / L) - 1;
  for (let cycle = firstCycle; cycle * L < end; cycle++) {
    for (const ev of pattern.events) {
      const evStart = cycle * L + ev.startTick;
      const evEnd = evStart + ev.durationTicks;
      if (evEnd <= absStart || evStart >= end) continue;
      const s = Math.max(evStart, absStart);
      const e = Math.min(evEnd, end);
      result.push({
        ...ev,
        id: `${ev.id}@${cycle}`,
        startTick: s - absStart,
        durationTicks: e - s,
        clippedStart: evStart < absStart,
        clippedEnd: evEnd > end,
      });
    }
  }
  return result.sort((a, b) => a.startTick - b.startTick);
}

export type NotationValue = {
  base: "whole" | "half" | "quarter" | "eighth" | "sixteenth";
  dotted: boolean;
};

const BASE_TICKS: [NotationValue["base"], number][] = [
  ["whole", TICKS_PER_QUARTER * 4],
  ["half", TICKS_PER_QUARTER * 2],
  ["quarter", TICKS_PER_QUARTER],
  ["eighth", EIGHTH],
  ["sixteenth", SIXTEENTH],
];

/** 長さから音符の種類を導出する。単一の音符・付点音符で表せない長さは null。 */
export function notationForDuration(durationTicks: number): NotationValue | null {
  for (const [base, t] of BASE_TICKS) {
    if (durationTicks === t) return { base, dotted: false };
    if (durationTicks === t * 1.5) return { base, dotted: true };
  }
  return null;
}

/**
 * 単一の音符で表せない長さを、表記可能な長さの和（タイで結ぶ）に分解する。
 * 例: 5×16分(15 tick) → [12, 3]
 */
export function splitIntoNotatable(durationTicks: number): number[] {
  const parts: number[] = [];
  let rest = durationTicks;
  const candidates = BASE_TICKS.flatMap(([, t]) => [t * 1.5, t]).sort((a, b) => b - a);
  while (rest > 0) {
    const c = candidates.find((t) => t <= rest);
    if (!c) {
      parts.push(rest);
      break;
    }
    parts.push(c);
    rest -= c;
  }
  return parts;
}

/** パターンのイベントが重ならず、範囲内に収まっているか検証する */
export function validatePattern(pattern: RhythmPattern): string[] {
  const errors: string[] = [];
  const sorted = [...pattern.events].sort((a, b) => a.startTick - b.startTick);
  let lastEnd = 0;
  for (const ev of sorted) {
    if (ev.durationTicks <= 0) errors.push(`長さが0以下のイベントがあります（${ev.startTick}）`);
    if (ev.startTick < lastEnd) errors.push(`イベントが重なっています（${ev.startTick}）`);
    if (ev.startTick + ev.durationTicks > pattern.lengthTicks)
      errors.push(`パターンの長さを超えています（${ev.startTick}）`);
    lastEnd = Math.max(lastEnd, ev.startTick + ev.durationTicks);
  }
  return errors;
}

// ---- ステップ編集（グリッド）とイベントの相互変換 ----

export type StepState = "note" | "rest" | "hold";
export type Step = { state: StepState; action: RhythmEvent["guitarAction"] };

/** イベント列をステップ列に変換する。stepTicks で割り切れない位置は最も近いステップに丸める。 */
export function eventsToSteps(events: RhythmEvent[], lengthTicks: number, stepTicks: number): Step[] {
  const n = Math.max(1, Math.round(lengthTicks / stepTicks));
  const steps: Step[] = Array.from({ length: n }, () => ({ state: "rest" as StepState, action: "none" as const }));
  const covered = new Array<boolean>(n).fill(false);
  for (const ev of [...events].sort((a, b) => a.startTick - b.startTick)) {
    const s = Math.round(ev.startTick / stepTicks);
    const len = Math.max(1, Math.round(ev.durationTicks / stepTicks));
    if (s >= n) continue;
    steps[s] = { state: ev.kind, action: ev.kind === "rest" ? "none" : ev.guitarAction };
    covered[s] = true;
    for (let i = s + 1; i < Math.min(n, s + len); i++) {
      steps[i] = { state: "hold", action: "none" };
      covered[i] = true;
    }
  }
  // どのイベントにも覆われていない位置は休符として扱う
  return steps.map((st, i) => (covered[i] ? st : { state: "rest", action: "none" }));
}

/**
 * ステップ列をイベント列に変換する。"hold" は直前のイベントを伸ばす。
 * 先頭の "hold" は伸ばす対象がないため休符になる。
 */
export function stepsToEvents(
  steps: Step[],
  stepTicks: number,
  makeId: () => string,
  previous: RhythmEvent[] = [],
): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  steps.forEach((st, i) => {
    const tick = i * stepTicks;
    if (st.state === "hold" && events.length > 0) {
      events[events.length - 1].durationTicks += stepTicks;
      return;
    }
    const kind = st.state === "note" ? "note" : "rest";
    // 同じ位置・種類の既存イベントがあれば ID を引き継ぐ
    const prev = previous.find((p) => p.startTick === tick && p.kind === kind);
    events.push({
      id: prev?.id ?? makeId(),
      startTick: tick,
      durationTicks: stepTicks,
      kind,
      guitarAction: kind === "rest" ? "none" : st.action,
    });
  });
  return events;
}
