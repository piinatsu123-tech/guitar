// 小節ごとのリズム（純粋関数）。複数小節にまたがるリズムを小節単位に分ける。
import type { RhythmEvent } from "../model/types";

type EventSpec = Omit<RhythmEvent, "id">;

/**
 * 先頭から count 小節ぶんのイベント列を、小節ごとのイベント列に分ける。
 * 小節線をまたぐ音符は、後ろの小節では「弾かずに伸ばす（タイ）」として続ける。休符はそのまま分ける。
 */
export function splitIntoMeasures(events: EventSpec[], measureTicks: number, count: number): EventSpec[][] {
  const out: EventSpec[][] = Array.from({ length: count }, () => []);
  for (const e of [...events].sort((a, b) => a.startTick - b.startTick)) {
    let start = e.startTick;
    const end = Math.min(e.startTick + e.durationTicks, measureTicks * count);
    let first = true;
    while (start < end) {
      const m = Math.floor(start / measureTicks);
      const barEnd = (m + 1) * measureTicks;
      const partEnd = Math.min(end, barEnd);
      out[m].push({
        startTick: start - m * measureTicks,
        durationTicks: partEnd - start,
        kind: e.kind,
        guitarAction: first || e.kind === "rest" ? e.guitarAction : "none",
      });
      first = false;
      start = partEnd;
    }
  }
  // 何も入っていない小節は全休符
  return out.map((list) =>
    list.length
      ? list
      : [{ startTick: 0, durationTicks: measureTicks, kind: "rest" as const, guitarAction: "none" as const }],
  );
}

/** 小節のイベントを、パターン長 lengthTicks の範囲に（足りなければくり返して）並べ直す */
export function fitToLength(events: EventSpec[], sourceLength: number, lengthTicks: number): EventSpec[] {
  const out: EventSpec[] = [];
  for (let base = 0; base < lengthTicks; base += sourceLength) {
    for (const e of events) {
      const s = base + e.startTick;
      if (s >= lengthTicks) continue;
      out.push({ ...e, startTick: s, durationTicks: Math.min(e.durationTicks, lengthTicks - s) });
    }
  }
  return out;
}
