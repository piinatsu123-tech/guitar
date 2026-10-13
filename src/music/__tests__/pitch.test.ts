import { describe, expect, it } from "vitest";
import { isBlackKey, midiAt, noteName, noteNameWithOctave, octaveOf, parsePitchClass, STANDARD_TUNING } from "../pitch";

describe("標準チューニングの音高", () => {
  it("各弦の開放音が正しい（E2 A2 D3 G3 B3 E4）", () => {
    expect(noteNameWithOctave(midiAt(6, 0)!, "abc")).toBe("E2");
    expect(noteNameWithOctave(midiAt(5, 0)!, "abc")).toBe("A2");
    expect(noteNameWithOctave(midiAt(4, 0)!, "abc")).toBe("D3");
    expect(noteNameWithOctave(midiAt(3, 0)!, "abc")).toBe("G3");
    expect(noteNameWithOctave(midiAt(2, 0)!, "abc")).toBe("B3");
    expect(noteNameWithOctave(midiAt(1, 0)!, "abc")).toBe("E4");
  });

  it("開放弦のドレミ表記", () => {
    expect([6, 5, 4, 3, 2, 1].map((s) => noteName(STANDARD_TUNING[s as 1], "solfege"))).toEqual([
      "ミ",
      "ラ",
      "レ",
      "ソ",
      "シ",
      "ミ",
    ]);
  });

  it("フレットを1つ上げると半音上がる", () => {
    for (const s of [1, 2, 3, 4, 5, 6] as const) {
      for (let f = 0; f < 24; f++) {
        expect(midiAt(s, f + 1)! - midiAt(s, f)!).toBe(1);
      }
    }
  });

  it("仕様書の例（6弦1F=F, 6弦2F=F♯, 5弦3F=C）", () => {
    expect(noteName(midiAt(6, 1)!, "abc")).toBe("F");
    expect(noteName(midiAt(6, 2)!, "abc")).toBe("F♯");
    expect(noteName(midiAt(5, 3)!, "abc")).toBe("C");
    expect(noteName(midiAt(5, 3)!, "solfege")).toBe("ド");
    expect(noteNameWithOctave(midiAt(5, 3)!, "abc")).toBe("C3");
  });

  it("5弦5F と 4弦開放は同じ音高（D3）", () => {
    expect(midiAt(5, 5)).toBe(midiAt(4, 0));
    expect(midiAt(2, 5)).toBe(midiAt(1, 0));
    expect(midiAt(3, 4)).toBe(midiAt(2, 0));
  });

  it("ミュート（null）は音高を持たない", () => {
    expect(midiAt(3, null)).toBeNull();
  });

  it("不正なフレットは例外", () => {
    expect(() => midiAt(1, -1)).toThrow();
    expect(() => midiAt(1, 1.5)).toThrow();
  });

  it("hidden 表記は空文字", () => {
    expect(noteName(60, "hidden")).toBe("");
    expect(noteNameWithOctave(60, "hidden")).toBe("");
  });

  it("オクターブ番号と黒鍵判定", () => {
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(59)).toBe(3);
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(64)).toBe(false);
  });

  it("音名文字列の解析", () => {
    expect(parsePitchClass("C")).toBe(0);
    expect(parsePitchClass("F#")).toBe(6);
    expect(parsePitchClass("Gb")).toBe(6);
    expect(parsePitchClass("B♭")).toBe(10);
    expect(parsePitchClass("Cb")).toBe(11);
    expect(parsePitchClass("H")).toBeNull();
  });
});
