// コード名の解析と、コードフォームの音楽的な検証。
import { parseSuffix } from "./chordSuffix";
import { midiAt, parsePitchClass, pitchClass, STRING_NUMBERS, type StringNumber } from "./pitch";

/** 1つのコード種類の定義。新しい種類はこの表に追加するだけで解析・生成・検証に対応する。 */
export type ChordQuality = {
  id: string;
  /** 表記ゆれを含むサフィックス（先頭が正規表記） */
  suffixes: string[];
  label: string;
  /** ルートからの半音数。0 は必ず含める。 */
  intervals: number[];
  /** フォーム上で省略してもよい音（主に完全5度） */
  optional: number[];
};

export const CHORD_QUALITIES: ChordQuality[] = [
  { id: "major", suffixes: ["", "M", "maj"], label: "メジャー", intervals: [0, 4, 7], optional: [] },
  { id: "minor", suffixes: ["m", "min", "-"], label: "マイナー", intervals: [0, 3, 7], optional: [] },
  { id: "7", suffixes: ["7", "dom7"], label: "セブンス", intervals: [0, 4, 7, 10], optional: [7] },
  {
    id: "maj7",
    suffixes: ["maj7", "M7", "△7", "Maj7", "△"],
    label: "メジャーセブンス",
    intervals: [0, 4, 7, 11],
    optional: [7],
  },
  { id: "m7", suffixes: ["m7", "min7", "-7"], label: "マイナーセブンス", intervals: [0, 3, 7, 10], optional: [7] },
  { id: "sus4", suffixes: ["sus4", "sus"], label: "サスフォー", intervals: [0, 5, 7], optional: [] },
  { id: "sus2", suffixes: ["sus2"], label: "サスツー", intervals: [0, 2, 7], optional: [] },
  { id: "7sus4", suffixes: ["7sus4"], label: "セブンス・サスフォー", intervals: [0, 5, 7, 10], optional: [7] },
  { id: "dim", suffixes: ["dim", "o"], label: "ディミニッシュ", intervals: [0, 3, 6], optional: [] },
  { id: "dim7", suffixes: ["dim7", "o7"], label: "ディミニッシュセブンス", intervals: [0, 3, 6, 9], optional: [] },
  { id: "aug", suffixes: ["aug", "+"], label: "オーギュメント", intervals: [0, 4, 8], optional: [] },
  {
    id: "m7b5",
    suffixes: ["m7b5", "m7♭5", "m7-5", "ø"],
    label: "マイナーセブン・フラットファイブ",
    intervals: [0, 3, 6, 10],
    optional: [],
  },
  { id: "6", suffixes: ["6"], label: "シックス", intervals: [0, 4, 7, 9], optional: [7] },
  { id: "m6", suffixes: ["m6"], label: "マイナーシックス", intervals: [0, 3, 7, 9], optional: [7] },
  { id: "add9", suffixes: ["add9", "add2"], label: "アドナインス", intervals: [0, 2, 4, 7], optional: [7] },
  {
    id: "mmaj7",
    suffixes: ["mM7", "mmaj7", "m△7"],
    label: "マイナーメジャーセブンス",
    intervals: [0, 3, 7, 11],
    optional: [7],
  },
];

export type ParsedChord = {
  name: string;
  root: number;
  quality: ChordQuality;
  /** 分数コードのベース音。指定がなければ null */
  bass: number | null;
  /** 必ず鳴らす必要があるピッチクラス */
  requiredPcs: number[];
  /** コードに含まれる全ピッチクラス */
  chordPcs: number[];
};

/** "C", "F#m7", "Bbmaj7", "G/B" などを解析する。解析できなければ null。 */
export function parseChord(name: string): ParsedChord | null {
  const trimmed = name.trim();
  // 6/9 は分数コードの「/」ではないので先に読み替える
  const m = /^([A-G](?:[#♯b♭])?)([^/]*?(?:6\/9)?[^/]*)(?:\/([A-G](?:[#♯b♭])?))?$/.exec(trimmed);
  if (!m) return null;
  const root = parsePitchClass(m[1]);
  if (root === null) return null;
  const suffix = m[2].replace("6/9", "69");
  // よく使う名前は表から、それ以外（aug7・dim9・7♭9 など）は汎用パーサーで解析する
  const quality = CHORD_QUALITIES.find((q) => q.suffixes.includes(suffix)) ?? parseSuffix(suffix);
  if (!quality) return null;
  const bass = m[3] ? parsePitchClass(m[3]) : null;
  const chordPcs = quality.intervals.map((i) => pitchClass(root + i));
  const requiredPcs = quality.intervals.filter((i) => !quality.optional.includes(i)).map((i) => pitchClass(root + i));
  if (bass !== null && !requiredPcs.includes(bass)) requiredPcs.push(bass);
  if (bass !== null && !chordPcs.includes(bass)) chordPcs.push(bass);
  return { name: trimmed, root, quality, bass, requiredPcs, chordPcs };
}

export type GuitarStringPosition = {
  stringNumber: StringNumber;
  /** 0 は開放弦、null はミュート */
  fret: number | null;
};

export type ChordForm = {
  id: string;
  chordName: string;
  positions: GuitarStringPosition[];
};

export type SoundingNote = {
  stringNumber: StringNumber;
  fret: number;
  midi: number;
};

/** フォームから実際に鳴る音（弦ごと）を低音弦から順に返す。ミュート弦は含めない。 */
export function soundingNotes(positions: GuitarStringPosition[]): SoundingNote[] {
  const result: SoundingNote[] = [];
  for (const s of [...STRING_NUMBERS].reverse()) {
    const pos = positions.find((p) => p.stringNumber === s);
    if (!pos || pos.fret === null) continue;
    const midi = midiAt(s, pos.fret);
    if (midi !== null) result.push({ stringNumber: s, fret: pos.fret, midi });
  }
  return result;
}

/** 6弦→1弦の順の配列 [fret|null ×6] から positions を作る */
export function positionsFromFrets(frets: (number | null)[]): GuitarStringPosition[] {
  if (frets.length !== 6) throw new Error("6弦分のフレットが必要です");
  return frets.map((fret, i) => ({ stringNumber: (6 - i) as StringNumber, fret }));
}

/** positions を 6弦→1弦の順の配列に変換する */
export function fretsFromPositions(positions: GuitarStringPosition[]): (number | null)[] {
  return [6, 5, 4, 3, 2, 1].map((s) => positions.find((p) => p.stringNumber === s)?.fret ?? null);
}

/** "x32010" 形式の短縮表記 */
export function formShorthand(positions: GuitarStringPosition[]): string {
  const frets = fretsFromPositions(positions);
  const wide = frets.some((f) => f !== null && f >= 10);
  return frets.map((f) => (f === null ? "x" : String(f))).join(wide ? "-" : "");
}

export type FormAnalysis = {
  chord: ParsedChord | null;
  notes: SoundingNote[];
  missingRequired: number[];
  missingOptional: number[];
  nonChordTones: number[];
  bassPc: number | null;
  bassOk: boolean;
  rootCount: number;
  /** 同じ MIDI 音高が複数の弦で鳴っている組 */
  unisonDuplicates: number[];
  /** コード名として成立しているか */
  valid: boolean;
};

/** フォームがコード名として成立しているかを検証する */
export function analyzeForm(chordName: string, positions: GuitarStringPosition[]): FormAnalysis {
  const chord = parseChord(chordName);
  const notes = soundingNotes(positions);
  const pcs = new Set(notes.map((n) => pitchClass(n.midi)));
  const bassPc = notes.length > 0 ? pitchClass(notes[0].midi) : null;
  const midiCounts = new Map<number, number>();
  for (const n of notes) midiCounts.set(n.midi, (midiCounts.get(n.midi) ?? 0) + 1);
  const unisonDuplicates = [...midiCounts.entries()].filter(([, c]) => c > 1).map(([m]) => m);

  if (!chord) {
    return {
      chord: null,
      notes,
      missingRequired: [],
      missingOptional: [],
      nonChordTones: [],
      bassPc,
      bassOk: false,
      rootCount: 0,
      unisonDuplicates,
      valid: false,
    };
  }
  const missingRequired = chord.requiredPcs.filter((pc) => !pcs.has(pc));
  const missingOptional = chord.chordPcs.filter((pc) => !chord.requiredPcs.includes(pc) && !pcs.has(pc));
  const nonChordTones = [...pcs].filter((pc) => !chord.chordPcs.includes(pc));
  const expectedBass = chord.bass ?? chord.root;
  const bassOk = bassPc === expectedBass;
  const rootCount = notes.filter((n) => pitchClass(n.midi) === chord.root).length;
  return {
    chord,
    notes,
    missingRequired,
    missingOptional,
    nonChordTones,
    bassPc,
    bassOk,
    rootCount,
    unisonDuplicates,
    valid: notes.length >= 3 && missingRequired.length === 0 && nonChordTones.length === 0 && bassOk,
  };
}
