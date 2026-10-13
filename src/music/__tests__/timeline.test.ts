import { describe, expect, it } from "vitest";
import { makeChord, makePattern, makeSection } from "../../model/factory";
import type { Song } from "../../model/types";
import {
  eventsToSteps,
  layoutSong,
  measuresOfSection,
  notationForDuration,
  resolveRhythmPattern,
  splitIntoNotatable,
  stepsToEvents,
  subdivisionLabel,
  tilePattern,
  ticksPerBeat,
  ticksPerMeasure,
  toMusicalPosition,
  validatePattern,
} from "../timeline";

const ts44 = { numerator: 4, denominator: 4 };

describe("tick の基準", () => {
  it("小節・拍の tick 数", () => {
    expect(ticksPerMeasure(ts44)).toBe(48);
    expect(ticksPerMeasure({ numerator: 3, denominator: 4 })).toBe(36);
    expect(ticksPerMeasure({ numerator: 6, denominator: 8 })).toBe(36);
    expect(ticksPerBeat({ numerator: 6, denominator: 8 })).toBe(6);
  });

  it("音符の種類は長さから導出する", () => {
    expect(notationForDuration(48)).toEqual({ base: "whole", dotted: false });
    expect(notationForDuration(12)).toEqual({ base: "quarter", dotted: false });
    expect(notationForDuration(6)).toEqual({ base: "eighth", dotted: false });
    expect(notationForDuration(3)).toEqual({ base: "sixteenth", dotted: false });
    expect(notationForDuration(18)).toEqual({ base: "quarter", dotted: true });
    expect(notationForDuration(15)).toBeNull();
    expect(splitIntoNotatable(15)).toEqual([12, 3]);
  });

  it("音楽的な位置と拍ラベル", () => {
    expect(toMusicalPosition(0, ts44)).toEqual({ measure: 1, beat: 1, tickInBeat: 0 });
    expect(toMusicalPosition(54, ts44)).toEqual({ measure: 2, beat: 1, tickInBeat: 6 });
    expect([0, 3, 6, 9, 12].map((t) => subdivisionLabel(t, ts44))).toEqual(["1", "e", "&", "a", "2"]);
  });
});

function song(): Song {
  const p1 = makePattern("8分", 48, [
    [0, 6, "note", "downstroke"],
    [6, 6, "note", "upstroke"],
    [12, 6, "note", "downstroke"],
    [18, 6, "note", "upstroke"],
    [24, 6, "note", "downstroke"],
    [30, 6, "note", "upstroke"],
    [36, 6, "note", "downstroke"],
    [42, 6, "note", "upstroke"],
  ]);
  const p2 = makePattern("全", 48, [[0, 48, "note", "downstroke"]]);
  const a = makeSection("A", [makeChord("C", 48), makeChord("G", 24), makeChord("Am", 72)]);
  const b = makeSection("B", [makeChord("F", 48)]);
  b.rhythmPatternId = p2.id;
  return {
    id: "s",
    title: "t",
    tempo: 90,
    timeSignature: ts44,
    sections: [a, b],
    forms: [],
    rhythmPatterns: [p1, p2],
    defaultRhythmPatternId: p1.id,
    createdAt: "",
    updatedAt: "",
  };
}

describe("曲の時間軸", () => {
  it("コードの絶対位置。セクションは小節頭から始まる", () => {
    const placed = layoutSong(song());
    expect(placed.map((p) => p.absStart)).toEqual([0, 48, 72, 144]);
  });

  it("小節への分割（小節をまたぐコード）", () => {
    const ms = measuresOfSection(song().sections[0], ts44);
    expect(ms).toHaveLength(3);
    expect(ms[1].map((s) => [s.chordName, s.start, s.length, s.continued])).toEqual([
      ["G", 0, 24, false],
      ["Am", 24, 24, false],
    ]);
    expect(ms[2].map((s) => [s.chordName, s.start, s.length, s.continued])).toEqual([["Am", 0, 48, true]]);
  });

  it("リズムパターンの解決（コード → セクション → 曲）", () => {
    const s = song();
    expect(resolveRhythmPattern(s, s.sections[0], s.sections[0].chords[0])!.name).toBe("8分");
    expect(resolveRhythmPattern(s, s.sections[1], s.sections[1].chords[0])!.name).toBe("全");
    const c = { ...s.sections[1].chords[0], rhythmPatternId: s.rhythmPatterns[0].id };
    expect(resolveRhythmPattern(s, s.sections[1], c)!.name).toBe("8分");
  });

  it("パターンは小節頭基準で敷き詰められる（拍の途中から始まるコード）", () => {
    const s = song();
    const ev = tilePattern(s.rhythmPatterns[0], 72, 72); // Am: 2小節目の3拍目から
    expect(ev[0]).toMatchObject({ startTick: 0, guitarAction: "downstroke" });
    expect(ev.map((e) => e.startTick)).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66]);
    expect(ev.every((e) => e.durationTicks === 6)).toBe(true);
  });

  it("範囲の途中で切れる音は clipped として返す", () => {
    const s = song();
    const ev = tilePattern(s.rhythmPatterns[1], 24, 48);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ startTick: 0, durationTicks: 24, clippedStart: true });
    expect(ev[1]).toMatchObject({ startTick: 24, durationTicks: 24, clippedStart: false, clippedEnd: true });
  });
});

describe("リズムパターンの編集", () => {
  it("ステップ ⇄ イベントの往復で内容が保たれる", () => {
    let n = 0;
    const id = () => `e${n++}`;
    const p = makePattern("x", 48, [
      [0, 12, "note", "downstroke"],
      [12, 6, "note", "downstroke"],
      [18, 6, "note", "upstroke"],
      [24, 6, "note", "none"],
      [30, 6, "note", "upstroke"],
      [36, 12, "rest", "none"],
    ]);
    const steps = eventsToSteps(p.events, 48, 3);
    expect(steps).toHaveLength(16);
    expect(steps[0]).toEqual({ state: "note", action: "downstroke" });
    expect(steps[1].state).toBe("hold");
    expect(steps[8]).toEqual({ state: "note", action: "none" });
    const back = stepsToEvents(steps, 3, id, p.events);
    expect(back.map((e) => [e.startTick, e.durationTicks, e.kind, e.guitarAction])).toEqual(
      p.events.map((e) => [e.startTick, e.durationTicks, e.kind, e.guitarAction]),
    );
    expect(back.map((e) => e.id)).toEqual(p.events.map((e) => e.id));
    expect(validatePattern({ ...p, events: back })).toEqual([]);
  });

  it("休符とストロークなしは別物として保持される", () => {
    const steps = eventsToSteps(
      [
        { id: "a", startTick: 0, durationTicks: 6, kind: "note", guitarAction: "none" },
        { id: "b", startTick: 6, durationTicks: 6, kind: "rest", guitarAction: "none" },
      ],
      12,
      6,
    );
    expect(steps).toEqual([
      { state: "note", action: "none" },
      { state: "rest", action: "none" },
    ]);
  });

  it("重なりを検出する", () => {
    const p = makePattern("x", 12, [
      [0, 12, "note", "downstroke"],
      [6, 6, "note", "upstroke"],
    ]);
    expect(validatePattern(p).length).toBeGreaterThan(0);
  });
});
