import { describe, expect, it } from "vitest";
import { analyzeForm, formShorthand, parseChord, positionsFromFrets, soundingNotes } from "../chord";

describe("コード名の解析", () => {
  it.each([
    ["C", 0, "major", [0, 4, 7]],
    ["Am", 9, "minor", [9, 0, 4]],
    ["G7", 7, "7", [7, 11, 2, 5]],
    ["Cmaj7", 0, "maj7", [0, 4, 7, 11]],
    ["CM7", 0, "maj7", [0, 4, 7, 11]],
    ["F#m", 6, "minor", [6, 9, 1]],
    ["Bbm7b5", 10, "m7b5", [10, 1, 4, 8]],
    ["Dsus4", 2, "sus4", [2, 7, 9]],
  ])("%s", (name, root, quality, pcs) => {
    const c = parseChord(name)!;
    expect(c.root).toBe(root);
    expect(c.quality.id).toBe(quality);
    expect(c.chordPcs).toEqual(pcs);
  });

  it("分数コード", () => {
    const c = parseChord("C/G")!;
    expect(c.bass).toBe(7);
  });

  it("解析できない名前は null", () => {
    expect(parseChord("X")).toBeNull();
    expect(parseChord("Cfoo")).toBeNull();
  });
});

describe("フォームの検証", () => {
  it("C (x32010) の発音音高", () => {
    const notes = soundingNotes(positionsFromFrets([null, 3, 2, 0, 1, 0]));
    expect(notes.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64]);
    expect(notes.map((n) => n.stringNumber)).toEqual([5, 4, 3, 2, 1]);
  });

  it("ミュート弦は発音しない", () => {
    const notes = soundingNotes(positionsFromFrets([null, null, 0, 2, 3, 2]));
    expect(notes).toHaveLength(4);
    expect(notes.some((n) => n.stringNumber === 6 || n.stringNumber === 5)).toBe(false);
  });

  it("正しいフォームは valid", () => {
    expect(analyzeForm("C", positionsFromFrets([null, 3, 2, 0, 1, 0])).valid).toBe(true);
    expect(analyzeForm("G7", positionsFromFrets([3, 2, 0, 0, 0, 1])).valid).toBe(true);
    expect(analyzeForm("Cmaj7", positionsFromFrets([null, 3, 2, 0, 0, 0])).valid).toBe(true);
  });

  it("構成音が欠けている・余計な音がある・ベースが違う場合は invalid", () => {
    const missing = analyzeForm("C7", positionsFromFrets([null, 3, 2, 0, 1, 0]));
    expect(missing.valid).toBe(false);
    expect(missing.missingRequired).toEqual([10]);
    const extra = analyzeForm("C", positionsFromFrets([null, 3, 2, 2, 1, 0]));
    expect(extra.nonChordTones).toEqual([9]);
    const bass = analyzeForm("C", positionsFromFrets([0, 3, 2, 0, 1, 0]));
    expect(bass.bassOk).toBe(false);
  });

  it("同じ音名でもオクターブ違いは別音高として数える", () => {
    const a = analyzeForm("C", positionsFromFrets([null, 3, 2, 0, 1, 0]));
    expect(a.rootCount).toBe(2);
    expect(a.unisonDuplicates).toEqual([]);
    const b = analyzeForm("E", positionsFromFrets([0, 2, 2, 1, 0, 0]));
    expect(b.unisonDuplicates).toEqual([]);
    const c = analyzeForm("A", positionsFromFrets([null, 0, 2, 2, 2, 5]));
    expect(c.unisonDuplicates).toEqual([]);
    const dup = analyzeForm("G", positionsFromFrets([3, 2, 0, 0, 3, 3]));
    expect(dup.unisonDuplicates).toEqual([]);
    const d = analyzeForm("A", positionsFromFrets([5, 0, 2, 2, 2, 0]));
    expect(d.unisonDuplicates).toEqual([45]);
  });

  it("短縮表記", () => {
    expect(formShorthand(positionsFromFrets([null, 3, 2, 0, 1, 0]))).toBe("x32010");
    expect(formShorthand(positionsFromFrets([8, 10, 10, 9, 8, 8]))).toBe("8-10-10-9-8-8");
  });
});
