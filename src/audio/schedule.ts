// 再生スケジュール（純粋関数）。曲データから「何秒後に何を鳴らすか」を作る。
// 表示と同じ時間軸（layoutSong・tilePattern）を使うので、画面の音符と音は必ず一致する。
//
// 音の対応:
//   音符＋ダウン   … 低音弦→高音弦の順に全弦をかき鳴らす
//   音符＋アップ   … 高音弦→低音弦の順に、高い側の最大4弦をかき鳴らす
//   音符＋ピッキング … 最低音（ベース音）を1本だけ鳴らす
//   音符＋ブラッシング … 音程のない打撃音を鳴らし、鳴っている弦を止める
//   音符＋弾かない … 何もしない（前の音を伸ばす）
//   休符           … 鳴っている弦を止める
// リズムパターン未設定のコードは、コードの頭で1回ダウンストロークする（音が途切れないように）。
import { soundingNotes, type SoundingNote } from "../music/chord";
import {
  layoutSong,
  resolveRhythmPattern,
  tilePattern,
  TICKS_PER_QUARTER,
  ticksPerBeat,
  ticksPerMeasure,
} from "../music/timeline";
import { resolveForm } from "../model/songOps";
import type { RhythmPattern, Song } from "../model/types";

export type AudioEvent =
  | { kind: "strum"; time: number; direction: "down" | "up"; notes: SoundingNote[] }
  | { kind: "pluck"; time: number; notes: SoundingNote[] }
  | { kind: "mute"; time: number }
  | { kind: "damp"; time: number }
  | { kind: "click"; time: number; accent: boolean };

export type Schedule = {
  events: AudioEvent[];
  /** 各コードの開始時刻（画面の選択を再生に追従させる） */
  chordStarts: { time: number; chordId: string }[];
  duration: number;
};

/** テンポは4分音符 = tempo（画面の「♩ = 96」と同じ） */
export function secondsPerTick(tempo: number): number {
  return 60 / tempo / TICKS_PER_QUARTER;
}

const UP_STROKE_STRINGS = 4;

function eventsForRhythm(
  rhythm: { startTick: number; kind: "note" | "rest"; guitarAction: string; clippedStart?: boolean }[],
  notes: SoundingNote[],
  toTime: (tick: number) => number,
): AudioEvent[] {
  const out: AudioEvent[] = [];
  for (const e of rhythm) {
    if (e.clippedStart) continue; // 前のコードから続いている音（新しく弾かない）
    const time = toTime(e.startTick);
    if (e.kind === "rest") {
      out.push({ kind: "damp", time });
      continue;
    }
    if (notes.length === 0) continue;
    switch (e.guitarAction) {
      case "downstroke":
        out.push({ kind: "strum", time, direction: "down", notes });
        break;
      case "upstroke":
        out.push({ kind: "strum", time, direction: "up", notes: notes.slice(-UP_STROKE_STRINGS) });
        break;
      case "pluck":
        out.push({ kind: "pluck", time, notes: notes.slice(0, 1) });
        break;
      case "mute":
        out.push({ kind: "mute", time });
        break;
      // "none": 何もしない
    }
  }
  return out;
}

function clicks(fromTick: number, toTick: number, song: Song, toTime: (tick: number) => number): AudioEvent[] {
  const beat = ticksPerBeat(song.timeSignature);
  const bar = ticksPerMeasure(song.timeSignature);
  const out: AudioEvent[] = [];
  for (let t = Math.ceil(fromTick / beat) * beat; t < toTick; t += beat) {
    out.push({ kind: "click", time: toTime(t), accent: t % bar === 0 });
  }
  return out;
}

/** 曲の startIndex 番目（通し番号）のコードから最後までのスケジュール */
export function buildSongSchedule(song: Song, startIndex: number, opts: { metronome?: boolean } = {}): Schedule {
  const placed = layoutSong(song).slice(Math.max(0, startIndex));
  if (placed.length === 0) return { events: [], chordStarts: [], duration: 0 };
  const spt = secondsPerTick(song.tempo);
  const origin = placed[0].absStart;
  const toTime = (absTick: number) => (absTick - origin) * spt;
  const events: AudioEvent[] = [];
  const chordStarts: Schedule["chordStarts"] = [];
  let endTick = origin;
  for (const p of placed) {
    const form = resolveForm(song, p.chord).form;
    const notes = form ? soundingNotes(form.positions) : [];
    const pattern = resolveRhythmPattern(song, p.section, p.chord);
    const abs = (rel: number) => toTime(p.absStart + rel);
    chordStarts.push({ time: toTime(p.absStart), chordId: p.chord.id });
    if (pattern) {
      events.push(...eventsForRhythm(tilePattern(pattern, p.sectionStart, p.chord.durationTicks), notes, abs));
    } else if (notes.length) {
      events.push({ kind: "strum", time: abs(0), direction: "down", notes });
    }
    endTick = p.absStart + p.chord.durationTicks;
  }
  if (opts.metronome) events.push(...clicks(origin, endTick, song, toTime));
  events.push({ kind: "damp", time: toTime(endTick) });
  events.sort((a, b) => a.time - b.time);
  return { events, chordStarts, duration: toTime(endTick) };
}

/** リズムパターン単体の試聴用（指定のコードの音で repeats 回くり返す） */
export function buildPatternSchedule(
  pattern: RhythmPattern,
  tempo: number,
  notes: SoundingNote[],
  repeats: number,
): Schedule {
  const spt = secondsPerTick(tempo);
  const length = pattern.lengthTicks * repeats;
  const events = eventsForRhythm(tilePattern(pattern, 0, length), notes, (t) => t * spt);
  events.push({ kind: "damp", time: length * spt });
  return { events, chordStarts: [], duration: length * spt };
}

/**
 * タップ録音用のクリック：カウントイン（countInBeats 拍）のあと、録音範囲 recordTicks の間も拍ごとに鳴らす。
 * 録音範囲の頭は countInBeats 拍目の後（= recordOffset 秒）。
 */
export function buildClickTrack(
  tempo: number,
  ts: { numerator: number; denominator: number },
  countInBeats: number,
  recordTicks: number,
): Schedule & { recordOffset: number } {
  const spt = secondsPerTick(tempo);
  const beat = ticksPerBeat(ts);
  const bar = ticksPerMeasure(ts);
  const countIn = countInBeats * beat;
  const events: AudioEvent[] = [];
  for (let t = 0; t < countIn + recordTicks; t += beat) {
    const inRecord = t - countIn;
    events.push({ kind: "click", time: t * spt, accent: inRecord >= 0 ? inRecord % bar === 0 : t === 0 });
  }
  return { events, chordStarts: [], duration: (countIn + recordTicks) * spt, recordOffset: countIn * spt };
}
