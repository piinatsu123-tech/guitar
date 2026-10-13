// 音高計算の中核。UI から独立した純粋関数のみを置く。
// 音高は MIDI ノート番号（C4 = 60）で保持し、表示時に音名へ変換する。

export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

export const STRING_NUMBERS: readonly StringNumber[] = [1, 2, 3, 4, 5, 6];

/** 標準チューニング（弦番号 → 開放弦の MIDI ノート番号） */
export const STANDARD_TUNING: Readonly<Record<StringNumber, number>> = {
  6: 40, // E2
  5: 45, // A2
  4: 50, // D3
  3: 55, // G3
  2: 59, // B3
  1: 64, // E4
};

export type Tuning = Readonly<Record<StringNumber, number>>;

export type NoteLabelMode = "solfege" | "abc" | "hidden";

const ABC_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const SOLFEGE_NAMES = ["ド", "ド♯", "レ", "レ♯", "ミ", "ファ", "ファ♯", "ソ", "ソ♯", "ラ", "ラ♯", "シ"] as const;

/** 0〜11 に正規化したピッチクラス */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** 科学的音高表記のオクターブ番号（MIDI 60 = C4） */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/**
 * 弦とフレットから発音音高を計算する。
 * fret が null（ミュート）の場合は null を返す。
 */
export function midiAt(
  stringNumber: StringNumber,
  fret: number | null,
  tuning: Tuning = STANDARD_TUNING,
): number | null {
  if (fret === null) return null;
  if (!Number.isInteger(fret) || fret < 0) {
    throw new RangeError(`不正なフレット番号: ${fret}`);
  }
  return tuning[stringNumber] + fret;
}

/** ピッチクラスの音名（オクターブなし）。hidden の場合は空文字。 */
export function pitchClassName(pc: number, mode: NoteLabelMode): string {
  const i = pitchClass(pc);
  switch (mode) {
    case "abc":
      return ABC_NAMES[i];
    case "solfege":
      return SOLFEGE_NAMES[i];
    case "hidden":
      return "";
  }
}

/** MIDI ノート番号の音名（オクターブなし） */
export function noteName(midi: number, mode: NoteLabelMode): string {
  return pitchClassName(pitchClass(midi), mode);
}

/** オクターブ付きの音名（例: "C4"、"ド4"） */
export function noteNameWithOctave(midi: number, mode: NoteLabelMode): string {
  if (mode === "hidden") return "";
  return `${noteName(midi, mode)}${octaveOf(midi)}`;
}

/** 黒鍵かどうか */
export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi));
}

/** 音名文字列（C, C#, Db, C♯, D♭ など）をピッチクラスに変換する。不正なら null。 */
export function parsePitchClass(name: string): number | null {
  const m = /^([A-Ga-g])([#♯b♭]*)$/.exec(name.trim());
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[m[1].toUpperCase()];
  for (const acc of m[2]) {
    pc += acc === "#" || acc === "♯" ? 1 : -1;
  }
  return pitchClass(pc);
}
