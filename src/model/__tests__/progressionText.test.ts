import { describe, expect, it } from "vitest";
import { makeChord, makeSection } from "../factory";
import { applyProgression, parseProgressionText, progressionToText } from "../progressionText";

const ts = { numerator: 4, denominator: 4 };

describe("コード進行のテキスト入力", () => {
  it("小節区切りと等分", () => {
    expect(parseProgressionText("| C | G | Am Em | F |", ts)).toEqual([
      { chordName: "C", durationTicks: 48 },
      { chordName: "G", durationTicks: 48 },
      { chordName: "Am", durationTicks: 24 },
      { chordName: "Em", durationTicks: 24 },
      { chordName: "F", durationTicks: 48 },
    ]);
  });

  it("- で伸ばす（小節をまたぐ場合も）", () => {
    expect(parseProgressionText("| C - - G | - | D |", ts)).toEqual([
      { chordName: "C", durationTicks: 36 },
      { chordName: "G", durationTicks: 60 },
      { chordName: "D", durationTicks: 48 },
    ]);
  });

  it("等分できない場合はエラー", () => {
    expect(() => parseProgressionText("| C G Am Em F |", ts)).toThrow();
    expect(() => parseProgressionText("| - |", ts)).toThrow();
  });

  it("テキスト表記との往復", () => {
    for (const text of ["| C | G | Am Em | F |", "| C - - G | - | D |", "| C | - | - | G7 |"]) {
      const sec = makeSection(
        "A",
        parseProgressionText(text, ts).map((p) => makeChord(p.chordName, p.durationTicks)),
      );
      expect(progressionToText(sec, ts)).toBe(text);
    }
  });

  it("既存コードの ID・歌詞を引き継ぎ、名前が変わればフォーム指定を外す", () => {
    const a = { ...makeChord("C", 48, "あいう"), formId: "f1" };
    const b = { ...makeChord("G", 48), formId: "f2" };
    const next = applyProgression([a, b], parseProgressionText("| C | Em |", ts));
    expect(next[0].id).toBe(a.id);
    expect(next[0].formId).toBe("f1");
    expect(next[0].lyrics).toEqual(a.lyrics);
    expect(next[1].id).toBe(b.id);
    expect(next[1].formId).toBeUndefined();
  });
});
