import { describe, expect, it } from "vitest";
import { makeChord, makePattern, makeSection } from "../../model/factory";
import type { Song } from "../../model/types";
import { sectionMeasureRows } from "../arrangement";

describe("小節ごとの表示データ", () => {
  it("コード・リズム・歌詞が小節内の共通の tick で揃う", () => {
    const p = makePattern("4分", 48, [
      [0, 12, "note", "downstroke"],
      [12, 12, "note", "downstroke"],
      [24, 12, "note", "downstroke"],
      [36, 12, "note", "downstroke"],
    ]);
    const long = makeChord("Am", 72);
    long.lyrics = [
      { id: "a", text: "あ", startTick: 0, accentMarked: false },
      { id: "b", text: "い", startTick: 30, accentMarked: true },
    ];
    const intro = makeSection("Intro", [makeChord("C", 48)]);
    const sec = makeSection("A", [makeChord("G", 24), long]);
    const song: Song = {
      id: "s",
      title: "t",
      tempo: 90,
      timeSignature: { numerator: 4, denominator: 4 },
      sections: [intro, sec],
      forms: [],
      rhythmPatterns: [p],
      defaultRhythmPatternId: p.id,
      createdAt: "",
      updatedAt: "",
    };
    const rows = sectionMeasureRows(song, sec);
    expect(rows).toHaveLength(2);
    expect(rows[0].absStart).toBe(48);
    const [g, am1] = rows[0].slots;
    expect(g.rhythm.map((e) => e.startTick)).toEqual([0, 12]);
    expect(am1.rhythm.map((e) => e.startTick)).toEqual([24, 36]);
    expect(am1.lyrics.map((l) => [l.text, l.measureTick])).toEqual([["あ", 24]]);
    const am2 = rows[1].slots[0];
    expect(am2.continued).toBe(true);
    expect(am2.lyrics.map((l) => [l.text, l.measureTick, l.accentMarked])).toEqual([["い", 6, true]]);
  });
});
