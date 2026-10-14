import { describe, expect, it } from "vitest";
import { makeChord, makeSection } from "../factory";
import {
  addSection,
  deleteChord,
  deleteSection,
  duplicateSection,
  insertChord,
  moveSection,
  saveForm,
  setMeasureRhythm,
  splitChord,
} from "../songOps";
import type { Song } from "../types";

function song(): Song {
  const a = makeSection("A", [makeChord("C", 48, "あいうえ"), makeChord("G", 48)]);
  const b = makeSection("B", [makeChord("F", 48)]);
  return {
    id: "s",
    title: "t",
    tempo: 90,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [a, b],
    forms: [],
    rhythmPatterns: [],
    createdAt: "",
    updatedAt: "",
  };
}
const names = (s: Song) => s.sections.map((x) => x.chords.map((c) => c.chordName).join(" ")).join(" | ");

describe("譜面からのコード進行の編集", () => {
  it("前後にコードを追加", () => {
    const s = song();
    const g = s.sections[0].chords[1].id;
    const r1 = insertChord(s, g, "before", "Am", 24);
    expect(names(r1.song)).toBe("C Am G | F");
    expect(r1.song.sections[0].chords[1].id).toBe(r1.chordId);
    const r2 = insertChord(r1.song, g, "after", "Em", 48);
    expect(names(r2.song)).toBe("C Am G Em | F");
  });

  it("削除すると未使用のフォームも消える", () => {
    let s = song();
    s = saveForm(s, { chordName: "G", frets: [3, 2, 0, 0, 3, 3] }, { applyToAll: true }).song;
    expect(s.forms).toHaveLength(1);
    s = deleteChord(s, s.sections[0].chords[1].id);
    expect(names(s)).toBe("C | F");
    expect(s.forms).toHaveLength(0);
  });

  it("分割すると歌詞は位置で振り分けられる", () => {
    const s = song();
    const c = s.sections[0].chords[0]; // あいうえ = 0,12,24,36
    const r = splitChord(s, c.id, 24)!;
    const [x, y] = r.song.sections[0].chords;
    expect([x.chordName, x.durationTicks, y.chordName, y.durationTicks]).toEqual(["C", 24, "C", 24]);
    expect(x.lyrics.map((l) => [l.text, l.startTick])).toEqual([
      ["あ", 0],
      ["い", 12],
    ]);
    expect(y.lyrics.map((l) => [l.text, l.startTick])).toEqual([
      ["う", 0],
      ["え", 12],
    ]);
    expect(splitChord(s, c.id, 0)).toBeNull();
  });

  it("セクションの追加・移動・削除・複製（小節のリズムも複製）", () => {
    let s = song();
    s = addSection(s, s.sections[0].id, "間奏", 48);
    expect(s.sections.map((x) => x.name)).toEqual(["A", "間奏", "B"]);
    s = moveSection(s, s.sections[2].id, -2);
    expect(s.sections.map((x) => x.name)).toEqual(["B", "A", "間奏"]);
    s = deleteSection(s, s.sections[2].id);
    expect(s.sections.map((x) => x.name)).toEqual(["B", "A"]);
    s = setMeasureRhythm(s, s.sections[1].id, 1, [
      { startTick: 0, durationTicks: 48, kind: "note", guitarAction: "downstroke" },
    ]);
    s = duplicateSection(s, s.sections[1].id);
    expect(s.sections.map((x) => x.name)).toEqual(["B", "A", "A（コピー）"]);
    expect(s.sections[2].measureRhythms?.[0].measure).toBe(1);
    expect(s.sections[2].chords[0].id).not.toBe(s.sections[1].chords[0].id);
    expect(s.sections[2].chords[0].lyrics).toEqual([]);
  });
});
