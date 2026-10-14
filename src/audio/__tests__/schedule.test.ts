import { describe, expect, it } from "vitest";
import { makeChord, makePattern, makeSection } from "../../model/factory";
import type { Song } from "../../model/types";
import { buildPatternSchedule, buildSongSchedule, secondsPerTick } from "../schedule";

function song(): Song {
  // ↓ ↓↑ (弾かない) ↑ 休
  const p = makePattern("p", 48, [
    [0, 12, "note", "downstroke"],
    [12, 6, "note", "downstroke"],
    [18, 6, "note", "upstroke"],
    [24, 6, "note", "none"],
    [30, 6, "note", "upstroke"],
    [36, 6, "note", "mute"],
    [42, 6, "rest", "none"],
  ]);
  const a = makeSection("A", [makeChord("C", 48), makeChord("G", 24), makeChord("Am", 24)]);
  return {
    id: "s",
    title: "t",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [a],
    forms: [],
    rhythmPatterns: [p],
    defaultRhythmPatternId: p.id,
    createdAt: "",
    updatedAt: "",
  };
}

describe("再生スケジュール", () => {
  it("テンポ120で4分音符 = 0.5秒", () => {
    expect(secondsPerTick(120) * 12).toBeCloseTo(0.5, 10);
  });

  it("音符とストロークの対応（弾かない＝音なし、休符＝止める、ブラッシング＝打撃音）", () => {
    const s = buildSongSchedule(song(), 0);
    const first = s.events.filter((e) => e.time < 2 - 1e-9);
    expect(first.map((e) => [e.kind, "direction" in e ? e.direction : "", +e.time.toFixed(3)])).toEqual([
      ["strum", "down", 0],
      ["strum", "down", 0.5],
      ["strum", "up", 0.75],
      // 1.0秒（3拍目）は「弾かない」なので何もない
      ["strum", "up", 1.25],
      ["mute", "", 1.5],
      ["damp", "", 1.75],
    ]);
  });

  it("ダウンは低音→高音の全弦、アップは高音側4弦（C = x32010 の実音）", () => {
    const s = buildSongSchedule(song(), 0);
    const down = s.events.find((e) => e.kind === "strum" && e.direction === "down")!;
    const up = s.events.find((e) => e.kind === "strum" && e.direction === "up")!;
    if (down.kind !== "strum" || up.kind !== "strum") throw new Error();
    expect(down.notes.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64]);
    expect(up.notes.map((n) => n.midi)).toEqual([52, 55, 60, 64]);
  });

  it("コードの切替時刻と、パターンは小節頭基準（Am は3拍目から＝パターン後半）", () => {
    const s = buildSongSchedule(song(), 0);
    expect(s.chordStarts.map((c) => +c.time.toFixed(3))).toEqual([0, 2, 3]);
    const am = s.events.filter((e) => e.time >= 3 - 1e-9 && e.time < 4 - 1e-9);
    expect(am.map((e) => e.kind)).toEqual(["strum", "mute", "damp"]); // 4拍目の ↑・ブラッシング・休符
    expect(s.duration).toBeCloseTo(4, 10);
  });

  it("途中のコードから再生すると、そのコードの頭が0秒", () => {
    const s = buildSongSchedule(song(), 1);
    expect(s.chordStarts[0].time).toBe(0);
    expect(s.events[0]).toMatchObject({ kind: "strum", direction: "down", time: 0 });
    expect(s.duration).toBeCloseTo(2, 10);
  });

  it("メトロノームは拍ごと、小節頭を強調", () => {
    const clicks = buildSongSchedule(song(), 0, { metronome: true }).events.filter((e) => e.kind === "click");
    expect(clicks).toHaveLength(8);
    expect(clicks.map((c) => (c.kind === "click" ? c.accent : null))).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it("パターン単体の試聴", () => {
    const s = buildPatternSchedule(song().rhythmPatterns[0], 60, [{ stringNumber: 6, fret: 0, midi: 40 }], 2);
    expect(s.duration).toBeCloseTo(8, 10);
    expect(s.events.filter((e) => e.kind === "strum")).toHaveLength(8);
  });
});

describe("タップ録音のクリック", () => {
  it("カウントイン1小節＋録音1小節（♩=120）", async () => {
    const { buildClickTrack } = await import("../schedule");
    const c = buildClickTrack(120, { numerator: 4, denominator: 4 }, 4, 48);
    expect(c.recordOffset).toBeCloseTo(2, 10);
    expect(c.duration).toBeCloseTo(4, 10);
    expect(c.events.map((e) => +e.time.toFixed(2))).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(c.events.map((e) => (e.kind === "click" ? e.accent : null))).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});
