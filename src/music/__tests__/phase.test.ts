import { describe, expect, it } from "vitest";
import { buildSongSchedule } from "../../audio/schedule";
import { makeChord, makePattern, makeSection } from "../../model/factory";
import type { Song } from "../../model/types";
import { sectionMeasureRows } from "../arrangement";

// 2小節パターン：1小節目は4分ダウン、2小節目は全音符
function song(): Song {
  const p = makePattern("2小節", 96, [
    [0, 12, "note", "downstroke"],
    [12, 12, "note", "downstroke"],
    [24, 12, "note", "downstroke"],
    [36, 12, "note", "downstroke"],
    [48, 48, "note", "downstroke"],
  ]);
  const intro = makeSection("イントロ", [makeChord("C", 48)]); // 1小節だけ
  const verse = makeSection("Aメロ", [makeChord("G", 96)]);
  verse.rhythmPatternId = p.id;
  return {
    id: "s",
    title: "t",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [intro, verse],
    forms: [],
    rhythmPatterns: [p],
    createdAt: "",
    updatedAt: "",
  };
}

describe("複数小節のパターンはセクションの頭から始まる", () => {
  it("表示：奇数小節目から始まるセクションでも、パターンの1小節目から", () => {
    const s = song();
    const rows = sectionMeasureRows(s, s.sections[1]);
    expect(rows[0].slots[0].rhythm.map((e) => e.startTick)).toEqual([0, 12, 24, 36]);
    expect(rows[1].slots[0].rhythm.map((e) => [e.startTick, e.durationTicks])).toEqual([[0, 48]]);
  });

  it("音：表示と同じ位置で鳴る", () => {
    const sch = buildSongSchedule(song(), 1);
    expect(sch.events.filter((e) => e.kind === "strum").map((e) => e.time)).toEqual([0, 0.5, 1, 1.5, 2]);
  });
});
