// 曲データから「小節ごとの表示用データ」を組み立てる。
// コード・リズム・歌詞はすべて小節内の tick で揃えて返すので、
// 描画側は tick ÷ 小節長 の比率で配置するだけでよい（画面幅に依存しない）。
import type { ChordEvent, LyricEvent, RhythmEvent, RhythmPattern, Section, Song } from "../model/types";
import {
  layoutSong,
  measuresOfSection,
  resolveRhythmPattern,
  tilePattern,
  ticksPerMeasure,
  type PlacedRhythmEvent,
} from "./timeline";

export type MeasureLyric = LyricEvent & {
  /** 小節頭からの位置 */
  measureTick: number;
};

export type MeasureSlotView = {
  chord: ChordEvent;
  start: number;
  length: number;
  continued: boolean;
  pattern: RhythmPattern | undefined;
  /** この小節に直接入力したリズムを使っている */
  custom: boolean;
  /** startTick は小節頭からの位置 */
  rhythm: PlacedRhythmEvent[];
  lyrics: MeasureLyric[];
};

export type MeasureRow = {
  sectionId: string;
  measureIndex: number;
  /** 曲頭からの絶対位置 */
  absStart: number;
  length: number;
  /** この小節に直接入力したリズムがある */
  custom: boolean;
  slots: MeasureSlotView[];
};

export function sectionMeasureRows(song: Song, section: Section): MeasureRow[] {
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);
  const placed = layoutSong(song).filter((p) => p.section.id === section.id);
  const sectionAbs = placed.length ? placed[0].absStart : 0;
  const chordStart = new Map(placed.map((p) => [p.chord.id, p.sectionStart]));
  const chordById = new Map(section.chords.map((c) => [c.id, c]));

  return measuresOfSection(section, ts).map((slots, measureIndex) => {
    const measureStart = measureIndex * m;
    const own = section.measureRhythms?.find((r) => r.measure === measureIndex);
    // 小節のリズムは「長さ1小節のパターン」として、小節頭から敷き詰める
    const ownPattern: RhythmPattern | undefined = own
      ? { id: `measure:${section.id}:${measureIndex}`, name: "この小節のリズム", lengthTicks: m, events: own.events }
      : undefined;
    return {
      sectionId: section.id,
      measureIndex,
      absStart: sectionAbs + measureStart,
      length: m,
      custom: !!own,
      slots: slots.map((slot) => {
        const chord = chordById.get(slot.chordId)!;
        const pattern = ownPattern ?? resolveRhythmPattern(song, section, chord);
        const phase = ownPattern ? slot.start : measureStart + slot.start;
        const rhythm = pattern
          ? tilePattern(pattern, phase, slot.length).map((e) => ({
              ...e,
              startTick: e.startTick + slot.start,
            }))
          : [];
        const offsetInChord = measureStart + slot.start - chordStart.get(chord.id)!;
        const lyrics = chord.lyrics
          .filter((l) => l.startTick >= offsetInChord && l.startTick < offsetInChord + slot.length)
          .map((l) => ({ ...l, measureTick: l.startTick - offsetInChord + slot.start }));
        return {
          chord,
          start: slot.start,
          length: slot.length,
          continued: slot.continued,
          pattern,
          custom: !!own,
          rhythm,
          lyrics,
        };
      }),
    };
  });
}

export type SongMeasure = { sectionId: string; measure: number; absStart: number; row: MeasureRow };

/** 曲全体の小節を通し番号順に並べる（セクションをまたいだ範囲選択・録音に使う） */
export function songMeasures(song: Song): SongMeasure[] {
  return song.sections.flatMap((section) =>
    sectionMeasureRows(song, section).map((row) => ({
      sectionId: section.id,
      measure: row.measureIndex,
      absStart: row.absStart,
      row,
    })),
  );
}

/**
 * 小節の今のリズム（直接入力があればそれ、なければパターンから求めたもの）を、
 * 小節頭からの位置のイベント列として返す。コピーや編集の出発点に使う。
 */
export function effectiveMeasureEvents(row: MeasureRow): Omit<RhythmEvent, "id">[] {
  const out: Omit<RhythmEvent, "id">[] = [];
  let cursor = 0;
  for (const slot of row.slots) {
    if (!slot.pattern) {
      out.push({ startTick: slot.start, durationTicks: slot.length, kind: "rest", guitarAction: "none" });
      cursor = slot.start + slot.length;
      continue;
    }
    for (const e of slot.rhythm) {
      // 前から続く音は「弾かずに伸ばす」として残す
      out.push({
        startTick: e.startTick,
        durationTicks: e.durationTicks,
        kind: e.kind,
        guitarAction: e.clippedStart && e.kind === "note" ? "none" : e.guitarAction,
      });
      cursor = Math.max(cursor, e.startTick + e.durationTicks);
    }
  }
  if (cursor < row.length)
    out.push({ startTick: cursor, durationTicks: row.length - cursor, kind: "rest", guitarAction: "none" });
  return out;
}
