import { describe, expect, it } from "vitest";
import { analyzeForm, formShorthand } from "../chord";
import { estimateFingering, generateForms } from "../formGenerator";

const shorthands = (name: string, opts = {}) => generateForms(name, opts).map((f) => formShorthand(f.positions));

describe("コードフォームの自動生成", () => {
  it("定番のオープンコードが最上位に来る", () => {
    expect(shorthands("C")[0]).toBe("x32010");
    expect(shorthands("Am")[0]).toBe("x02210");
    expect(shorthands("Em")[0]).toBe("022000");
    expect(shorthands("E")[0]).toBe("022100");
    expect(shorthands("D")[0]).toBe("xx0232");
    expect(shorthands("A")[0]).toBe("x02220");
    expect(shorthands("Dm")[0]).toBe("xx0231");
    expect(shorthands("Cmaj7")[0]).toBe("x32000");
    expect(["320003", "320033"]).toContain(shorthands("G")[0]);
    expect(["320001"]).toContain(shorthands("G7")[0]);
  });

  it("F はセーハフォームを候補に含む", () => {
    expect(shorthands("F")).toContain("133211");
  });

  it("Bm はセーハフォームを候補に含む", () => {
    expect(shorthands("Bm")[0]).toBe("x24432");
  });

  it("すべての候補がコードとして成立している", () => {
    for (const name of ["C", "G", "Am", "Em", "F", "Bm", "G7", "Cmaj7", "B7", "Fmaj7", "Am7", "Dsus4", "F#m", "C/G"]) {
      const forms = generateForms(name);
      expect(forms.length).toBeGreaterThan(1);
      for (const f of forms) expect(analyzeForm(name, f.positions).valid).toBe(true);
    }
  });

  it("開放弦を使わない指定", () => {
    for (const f of generateForms("C", { allowOpen: false })) {
      expect(f.frets.every((x) => x !== 0)).toBe(true);
    }
  });

  it("フレット範囲の指定", () => {
    const forms = generateForms("A", { minFret: 5, maxFret: 9 });
    expect(forms.length).toBeGreaterThan(0);
    for (const f of forms) {
      for (const x of f.frets) if (x !== null) expect(x).toBeGreaterThanOrEqual(5);
      for (const x of f.frets) if (x !== null) expect(x).toBeLessThanOrEqual(9);
    }
    expect(forms.map((f) => formShorthand(f.positions))).toContain("577655");
  });

  it("候補数の指定と重複なし", () => {
    const forms = generateForms("G", { maxResults: 3 });
    expect(forms).toHaveLength(3);
    const keys = forms.map((f) => f.frets.join(","));
    expect(new Set(keys).size).toBe(3);
  });

  it("解析できないコード名は空", () => {
    expect(generateForms("Xyz")).toEqual([]);
  });

  it("運指の推定（セーハ）", () => {
    expect(estimateFingering([1, 3, 3, 2, 1, 1])).toEqual({ fingers: 4, barre: 1 });
    expect(estimateFingering([null, 3, 2, 0, 1, 0])).toEqual({ fingers: 3, barre: null });
  });

  it("パワーコード（5）：ルートと5度だけ、低音弦の定番の形が上位", () => {
    expect(shorthands("E5")[0]).toBe("022xxx");
    expect(shorthands("A5")[0]).toBe("x022xx");
    expect(shorthands("F5")[0]).toBe("133xxx");
    expect(shorthands("B5")[0]).toBe("x244xx");
    expect(shorthands("C5", { maxResults: 3 })).toContain("x355xx");
    for (const name of ["C5", "D5", "G5", "Bb5", "F#5"]) {
      const forms = generateForms(name);
      expect(forms.length).toBeGreaterThan(0);
      for (const f of forms) {
        expect(analyzeForm(name, f.positions).valid).toBe(true);
        // 鳴らす弦が隣り合っている
        const idx = f.frets.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0);
        expect(idx[idx.length - 1] - idx[0] + 1).toBe(idx.length);
      }
    }
  });
});
