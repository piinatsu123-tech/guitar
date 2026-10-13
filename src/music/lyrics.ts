// 歌詞の文字分割とタイミング管理。
// 各文字は永続 ID を持ち、配列インデックスを ID として扱わない。
import type { LyricEvent } from "../model/types";

/** 文字列を書記素（見た目の1文字）単位に分割する */
export function splitGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(new Seg("ja", { granularity: "grapheme" }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

export function lyricsText(events: LyricEvent[]): string {
  return sortLyrics(events)
    .map((e) => e.text)
    .join("");
}

export function sortLyrics<T extends LyricEvent>(events: T[]): T[] {
  // 同じ tick の文字は入力順（安定ソート）を保つ
  return [...events].sort((a, b) => a.startTick - b.startTick);
}

function snap(tick: number, step: number): number {
  return Math.round(tick / step) * step;
}

/** n 文字を [0, duration) に均等に配置した tick を返す（step 単位に丸める、単調非減少） */
export function distributeTicks(n: number, duration: number, step: number): number[] {
  const maxTick = Math.max(0, Math.floor((duration - 1) / step) * step);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.min(maxTick, snap((i * duration) / Math.max(1, n), step)));
  }
  return out;
}

/**
 * 歌詞テキストを編集したとき、既存の文字の ID・タイミング・マークを可能な限り引き継ぐ。
 * 先頭・末尾の一致部分は保持し、変更された中間部分だけを前後の文字の間に配置し直す。
 */
export function reconcileLyrics(
  previous: LyricEvent[],
  newText: string,
  duration: number,
  step: number,
  makeId: () => string,
): LyricEvent[] {
  const chars = splitGraphemes(newText);
  const prev = sortLyrics(previous);
  if (prev.length === 0) {
    const ticks = distributeTicks(chars.length, duration, step);
    return chars.map((text, i) => ({ id: makeId(), text, startTick: ticks[i], accentMarked: false }));
  }
  let head = 0;
  while (head < chars.length && head < prev.length && chars[head] === prev[head].text) head++;
  let tail = 0;
  while (
    tail < chars.length - head &&
    tail < prev.length - head &&
    chars[chars.length - 1 - tail] === prev[prev.length - 1 - tail].text
  )
    tail++;

  const kept = prev.slice(0, head);
  const keptTail = prev.slice(prev.length - tail);
  const middle = chars.slice(head, chars.length - tail);
  let ticks: number[];
  if (kept.length === 0 && keptTail.length === 0) {
    ticks = distributeTicks(middle.length, duration, step);
  } else {
    // 前後に残った文字の間に等間隔で置く（前後の文字の位置そのものは含めない）
    const maxTick = Math.max(0, Math.floor((duration - 1) / step) * step);
    const lo = kept.length ? kept[kept.length - 1].startTick : 0;
    const hi = keptTail.length ? keptTail[0].startTick : maxTick;
    const headFlag = kept.length ? 1 : 0;
    const total = middle.length + headFlag + (keptTail.length ? 1 : 0);
    let last = lo;
    ticks = middle.map((_, i) => {
      const k = i + headFlag;
      const t = total > 1 ? lo + ((hi - lo) * k) / (total - 1) : lo;
      last = Math.min(hi, Math.max(last, snap(t, step)));
      return last;
    });
  }
  return [
    ...kept,
    ...middle.map((text, i) => ({ id: makeId(), text, startTick: ticks[i], accentMarked: false })),
    ...keptTail,
  ];
}

/** コードの長さが変わったとき、範囲外に出た文字を最後の位置に収める */
export function clampLyrics(events: LyricEvent[], duration: number, step: number): LyricEvent[] {
  const maxTick = Math.max(0, Math.floor((duration - 1) / step) * step);
  return events.map((e) => (e.startTick > maxTick ? { ...e, startTick: maxTick } : e));
}

export type LyricGroup<T extends LyricEvent = LyricEvent> = { startTick: number; chars: T[] };

/** 同じ位置に置かれた文字をまとめる（1つの音に複数の文字を対応させる表示用） */
export function groupLyricsByTick<T extends LyricEvent>(events: T[]): LyricGroup<T>[] {
  const groups: LyricGroup<T>[] = [];
  for (const e of sortLyrics(events)) {
    const last = groups[groups.length - 1];
    if (last && last.startTick === e.startTick) last.chars.push(e);
    else groups.push({ startTick: e.startTick, chars: [e] });
  }
  return groups;
}

export function toggleAccent(events: LyricEvent[], id: string): LyricEvent[] {
  return events.map((e) => (e.id === id ? { ...e, accentMarked: !e.accentMarked } : e));
}
