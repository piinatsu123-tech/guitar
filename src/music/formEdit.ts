// 鍵盤で音を選んでフォームを作るための純粋関数。
// frets は 6弦→1弦の順（formShorthand と同じ並び）。null はミュート。
import { STANDARD_TUNING, type StringNumber, type Tuning } from "./pitch";

/** 鍵盤から選べる最高フレット */
export const MAX_EDIT_FRET = 20;

type Frets = (number | null)[];

const stringOf = (i: number) => (6 - i) as StringNumber;

/** この音を鳴らせる（弦, フレット）の候補。低い弦から順。 */
export function placementsOf(midi: number, tuning: Tuning = STANDARD_TUNING): { index: number; fret: number }[] {
  const out: { index: number; fret: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const fret = midi - tuning[stringOf(i)];
    if (fret >= 0 && fret <= MAX_EDIT_FRET) out.push({ index: i, fret });
  }
  return out;
}

/** フォームで鳴っている MIDI ノート（弦ごと、ミュートは null） */
export function formMidis(frets: Frets, tuning: Tuning = STANDARD_TUNING): (number | null)[] {
  return frets.map((f, i) => (f === null ? null : tuning[stringOf(i)] + f));
}

/**
 * 鍵盤の音をタップしたときのフォームの変化。
 * - その音をすでに鳴らしている弦があれば、その弦をミュートする（音を外す）。
 * - なければ、その音を鳴らせる弦のうち、押さえやすい位置を選んで加える。
 *   空いている（ミュートの）弦を優先し、今押さえている位置の近く（指が届く範囲）を選ぶ。
 *   空き弦で届かなければ、他の音を鳴らしている弦を置き換える。
 * 鳴らせない音（ギターの音域外）のときは null。
 */
export function toggleNoteInForm(frets: Frets, midi: number, tuning: Tuning = STANDARD_TUNING): Frets | null {
  const current = formMidis(frets, tuning);
  if (current.includes(midi)) return frets.map((f, i) => (current[i] === midi ? null : f));

  const candidates = placementsOf(midi, tuning);
  if (candidates.length === 0) return null;

  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  const center = pressed.length ? (Math.min(...pressed) + Math.max(...pressed)) / 2 : null;

  let best: { index: number; fret: number } | null = null;
  let bestCost = Infinity;
  for (const c of candidates) {
    let cost = 0;
    // 他の音を消すのはなるべく避ける
    if (frets[c.index] !== null) cost += 10;
    if (c.fret > 0) {
      const others = frets.filter((f, i): f is number => i !== c.index && f !== null && f > 0);
      const all = [...others, c.fret];
      const span = Math.max(...all) - Math.min(...all);
      if (span > 3) cost += (span - 3) * 6; // 指が届かない
      cost += center === null ? c.fret * 0.3 : Math.abs(c.fret - center);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  const chosen = best!;
  return frets.map((f, i) => (i === chosen.index ? chosen.fret : f));
}
