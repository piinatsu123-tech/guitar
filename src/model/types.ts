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
  /** 歌詞シートで、このコードの歌詞のあとで行が終わる */
  lineBreak?: boolean;
};

/**
 * 小節に直接入力したリズム。パターンの割り当てより優先される。
 * measure はセクション内の小節番号（0 始まり）、events の位置は小節頭からの tick。
 * コードではなく「曲のその位置」に結びつく（コードを差し替えてもリズムは残る）。
 */
export type MeasureRhythm = {
  measure: number;
  events: RhythmEvent[];
};

export type Section = {
  id: string;
  name: string;
  rhythmPatternId?: string;
  chords: ChordEvent[];
  measureRhythms?: MeasureRhythm[];
  /** 歌詞の行ごとのリズム譜（コードとは切り離して、リズムだけを採譜したもの）。line はセクション内の行番号 */
  lineRhythms?: LineRhythm[];
  /** 歌詞の行の小節の区切り（行の何文字目から新しい小節か。行頭は常に小節の頭なので含めない） */
  lineBars?: { line: number; starts: number[] }[];
};

/** リズム譜（小節数×小節長） */
export type SectionRhythm = { events: RhythmEvent[]; lengthTicks: number };
export type LineRhythm = SectionRhythm & { line: number };

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
  /** 演奏画面の表示形式: 譜面（全体を通して見る）／コード詳細 */
  playView: "score" | "detail";
  /** コード図（TAB） */
  showTab: boolean;
  showPiano: boolean;
  showLyrics: boolean;
  /** リズムの音符・休符 */
  showRhythm: boolean;
  /** ピッキング（ストロークの向き）の位置 */
  showStrokes: boolean;
  tabLabelMode: NoteLabelMode;
  pianoLabelMode: NoteLabelMode;
  /** コード図の左に開放弦の音名（E A D G B E）を常に出す */
  showOpenStrings: boolean;
};

export const DEFAULT_SETTINGS: DisplaySettings = {
  playView: "score",
  showTab: true,
  showPiano: false,
  showLyrics: true,
  showRhythm: true,
  showStrokes: false,
  tabLabelMode: "solfege",
  pianoLabelMode: "abc",
  showOpenStrings: true,
};
