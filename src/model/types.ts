// 永続化されるデータモデル。表示（ピクセル）に関わる値は一切持たない。
// 時間位置はすべて tick（4分音符 = TICKS_PER_QUARTER tick）で表す。
import type { ChordForm } from "../music/chord";
import type { NoteLabelMode } from "../music/pitch";

export type { ChordForm, GuitarStringPosition } from "../music/chord";
export type { NoteLabelMode } from "../music/pitch";

export type TimeSignature = {
  numerator: number;
  denominator: number;
};

/** ギターの演奏動作。音符・休符（RhythmEvent.kind）とは独立している。 */
export type GuitarAction =
  | "downstroke"
  | "upstroke"
  | "pluck"
  | "mute" // ブラッシング（音程のないカッティング）
  | "none"; // 新たに弾かない（前の音を伸ばす／タイ）

/**
 * リズムパターン内の1イベント。
 * 音符の種類（4分・8分など）は durationTicks から導出するため保存しない
 * （notation と長さが食い違う状態を作らないため）。
 */
export type RhythmEvent = {
  id: string;
  /** パターン先頭からの位置 */
  startTick: number;
  durationTicks: number;
  kind: "note" | "rest";
  guitarAction: GuitarAction;
};

export type RhythmPattern = {
  id: string;
  name: string;
  /** パターン1周の長さ。曲中では小節頭を基準に繰り返し適用される。 */
  lengthTicks: number;
  events: RhythmEvent[];
};

/** 歌詞の1文字（書記素）。startTick はコードの開始位置からの相対位置。 */
export type LyricEvent = {
  id: string;
  text: string;
  startTick: number;
  /** 「この位置でギターを弾く」マーク（歌唱上の強勢ではない） */
  accentMarked: boolean;
};

export type ChordEvent = {
  id: string;
  chordName: string;
  durationTicks: number;
  /** 未指定、またはフォームのコード名と一致しない場合は自動生成の最上位候補を使う */
  formId?: string;
  /** 未指定ならセクション → 曲の既定パターンの順に解決する */
  rhythmPatternId?: string;
  lyrics: LyricEvent[];
};

export type Section = {
  id: string;
  name: string;
  rhythmPatternId?: string;
  chords: ChordEvent[];
};

export type Song = {
  id: string;
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  sections: Section[];
  forms: ChordForm[];
  rhythmPatterns: RhythmPattern[];
  defaultRhythmPatternId?: string;
  createdAt: string;
  updatedAt: string;
};

export type DisplaySettings = {
  showTab: boolean;
  showPiano: boolean;
  showLyrics: boolean;
  showRhythm: boolean;
  tabLabelMode: NoteLabelMode;
  pianoLabelMode: NoteLabelMode;
};

export const DEFAULT_SETTINGS: DisplaySettings = {
  showTab: true,
  showPiano: true,
  showLyrics: true,
  showRhythm: true,
  tabLabelMode: "solfege",
  pianoLabelMode: "abc",
};
