// 曲データから「小節ごとの表示用データ」を組み立てる。
// コード・リズム・歌詞はすべて小節内の tick で揃えて返すので、
// 描画側は tick ÷ 小節長 の比率で配置するだけでよい（画面幅に依存しない）。
import type { ChordEvent, LyricEvent, RhythmPattern, Section, Song } from "../model/types";
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
    return {
      sectionId: section.id,
      measureIndex,
      absStart: sectionAbs + measureStart,
      length: m,
      slots: slots.map((slot) => {
        const chord = chordById.get(slot.chordId)!;
        const pattern = resolveRhythmPattern(song, section, chord);
        const slotAbs = sectionAbs + measureStart + slot.start;
        const rhythm = pattern
          ? tilePattern(pattern, slotAbs, slot.length).map((e) => ({ ...e, startTick: e.startTick + slot.start }))
          : [];
        const offsetInChord = measureStart + slot.start - chordStart.get(chord.id)!;
        const lyrics = chord.lyrics
          .filter((l) => l.startTick >= offsetInChord && l.startTick < offsetInChord + slot.length)
          .map((l) => ({ ...l, measureTick: l.startTick - offsetInChord + slot.start }));
        return { chord, start: slot.start, length: slot.length, continued: slot.continued, pattern, rhythm, lyrics };
      }),
    };
  });
}
