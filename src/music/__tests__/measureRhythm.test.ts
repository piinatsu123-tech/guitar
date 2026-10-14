import { describe, expect, it } from "vitest";
import { buildRangeSchedule, buildSongSchedule } from "../../audio/schedule";
import { makeChord, makePattern, makeSection } from "../../model/factory";
import { setMeasureRhythm } from "../../model/songOps";
import type { Song } from "../../model/types";
import { normalizeSong } from "../../storage/repository";
import { effectiveMeasureEvents, sectionMeasureRows, songMeasures } from "../arrangement";
import { fitToLength, splitIntoMeasures } from "../measureRhythm";

const Q = 12;
function song(): Song {
  const p = makePattern("4分", 48, [
    [0, Q, "note", "downstroke"],
    [Q, Q, "note", "downstroke"],
    [2 * Q, Q, "note", "downstroke"],
    [3 * Q, Q, "note", "downstroke"],
  ]);
  const intro = makeSection("イントロ", [makeChord("C", 48)]);
  // G が2小節目の3拍目から始まる（小節の途中でコードが変わる）
  const a = makeSection("A", [makeChord("Am", 72), makeChord("G", 24), makeChord("F", 48)]);
  return {
    id: "s",
    title: "t",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [intro, a],
    forms: [],
    rhythmPatterns: [p],
    defaultRhythmPatternId: p.id,
    createdAt: "",
    updatedAt: "",
  };
}
// 8分の ↓↑ ×8
const eighths = Array.from({ length: 8 }, (_, i) => ({
  startTick: i * 6,
  durationTicks: 6,
  kind: "note" as const,
  guitarAction: (i % 2 ? "upstroke" : "downstroke") as "upstroke" | "downstroke",
}));

describe("小節ごとのリズム", () => {
  it("直接入力した小節はパターンより優先され、ほかの小節はパターンのまま", () => {
    const s0 = song();
    const s = setMeasureRhythm(s0, s0.sections[1].id, 1, eighths);
    const rows = sectionMeasureRows(s, s.sections[1]);
    expect(rows.map((r) => r.custom)).toEqual([false, true, false]);
    expect(rows[0].slots[0].rhythm.map((e) => e.startTick)).toEqual([0, 12, 24, 36]);
    // 2小節目：Am（前半）と G（後半）の両方に、小節のリズムが位置どおりに入る
    const [am, g] = rows[1].slots;
    expect(am.rhythm.map((e) => [e.startTick, e.guitarAction])).toEqual([
      [0, "downstroke"],
      [6, "upstroke"],
      [12, "downstroke"],
      [18, "upstroke"],
    ]);
    expect(g.rhythm.map((e) => [e.startTick, e.guitarAction])).toEqual([
      [24, "downstroke"],
      [30, "upstroke"],
      [36, "downstroke"],
      [42, "upstroke"],
    ]);
  });

  it("音も表示と同じ（2小節目は8分、コード切替で G の音に変わる）", () => {
    const s0 = song();
    const s = setMeasureRhythm(s0, s0.sections[1].id, 1, eighths);
    const m = songMeasures(s);
    expect(m.map((x) => x.absStart)).toEqual([0, 48, 96, 144]);
    const sch = buildRangeSchedule(s, 96, 144); // A の2小節目だけ
    const strums = sch.events.filter((e) => e.kind === "strum");
    expect(strums.map((e) => +e.time.toFixed(3))).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    expect(sch.chordStarts.map((c) => +c.time.toFixed(2))).toEqual([1]); // G の頭（Am は前の小節から続く）
    const g = strums[4];
    if (g.kind !== "strum") throw new Error();
    expect(g.notes[0].midi).toBe(43); // G (320003) の最低音 G2
  });

  it("解除するとパターンに戻る", () => {
    const s0 = song();
    const id = s0.sections[1].id;
    const s = setMeasureRhythm(setMeasureRhythm(s0, id, 1, eighths), id, 1, null);
    expect(s.sections[1].measureRhythms).toBeUndefined();
    expect(sectionMeasureRows(s, s.sections[1])[1].slots[0].rhythm).toHaveLength(2);
  });

  it("小節の今のリズム（パターン由来・コードをまたぐ伸ばしは「弾かない」）", () => {
    const p = makePattern("全", 48, [[0, 48, "note", "downstroke"]]);
    const s0 = { ...song(), rhythmPatterns: [p], defaultRhythmPatternId: p.id };
    const row = sectionMeasureRows(s0, s0.sections[1])[1]; // Am | G
    expect(effectiveMeasureEvents(row)).toEqual([
      { startTick: 0, durationTicks: 24, kind: "note", guitarAction: "downstroke" },
      { startTick: 24, durationTicks: 24, kind: "note", guitarAction: "none" },
    ]);
  });

  it("複数小節のリズムを小節ごとに分ける（小節線をまたぐ音はタイ）", () => {
    const parts = splitIntoMeasures(
      [
        { startTick: 0, durationTicks: 36, kind: "note", guitarAction: "downstroke" },
        { startTick: 36, durationTicks: 24, kind: "note", guitarAction: "upstroke" }, // 1小節目4拍目〜2小節目1拍目
      ],
      48,
      3,
    );
    expect(parts[0].map((e) => [e.startTick, e.durationTicks, e.guitarAction])).toEqual([
      [0, 36, "downstroke"],
      [36, 12, "upstroke"],
    ]);
    expect(parts[1].map((e) => [e.startTick, e.durationTicks, e.guitarAction])).toEqual([[0, 12, "none"]]);
    expect(parts[2]).toEqual([{ startTick: 0, durationTicks: 48, kind: "rest", guitarAction: "none" }]);
  });

  it("1小節のリズムを2小節のパターンにくり返して入れる", () => {
    const one = [{ startTick: 0, durationTicks: 24, kind: "note" as const, guitarAction: "downstroke" as const }];
    expect(fitToLength(one, 48, 96).map((e) => e.startTick)).toEqual([0, 48]);
  });

  it("途中のコードから再生しても同じ（buildSongSchedule）", () => {
    const s0 = song();
    const s = setMeasureRhythm(s0, s0.sections[1].id, 1, eighths);
    const sch = buildSongSchedule(s, 2); // G から
    expect(
      sch.events
        .filter((e) => e.kind === "strum")
        .slice(0, 4)
        .map((e) => +e.time.toFixed(3)),
    ).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("保存・読み込みで小節のリズムが残る", () => {
    const s0 = song();
    const s = setMeasureRhythm(s0, s0.sections[1].id, 1, eighths);
    const n = normalizeSong(JSON.parse(JSON.stringify(s)));
    expect(n.sections[1].measureRhythms).toEqual(s.sections[1].measureRhythms);
  });
});
