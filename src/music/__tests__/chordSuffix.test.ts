import { describe, expect, it } from "vitest";
import { analyzeForm, formShorthand, parseChord } from "../chord";
import { generateForms } from "../formGenerator";

// ルート C（=0）からの構成音（ピッチクラス）
const pcs = (name: string) => [...parseChord(name)!.chordPcs].sort((a, b) => a - b);
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe("aug・dim に 7th・テンションが付いたコード", () => {
  it.each([
    // aug + 7th
    ["Caug7", [0, 4, 8, 10]],
    ["C+7", [0, 4, 8, 10]],
    ["C7#5", [0, 4, 8, 10]],
    ["C7+5", [0, 4, 8, 10]],
    ["C7(♯5)", [0, 4, 8, 10]],
    ["Caugmaj7", [0, 4, 8, 11]],
    ["Cmaj7#5", [0, 4, 8, 11]],
    ["C+M7", [0, 4, 8, 11]],
    ["Caug9", [0, 2, 4, 8, 10]],
    ["C9#5", [0, 2, 4, 8, 10]],
    // dim + 7th・テンション
    ["Cdim7", [0, 3, 6, 9]],
    ["C°7", [0, 3, 6, 9]],
    ["Co7", [0, 3, 6, 9]],
    ["Cdim9", [0, 2, 3, 6, 9]],
    ["Cdim7(9)", [0, 2, 3, 6, 9]],
    ["Cm7b5", [0, 3, 6, 10]],
    ["Cø", [0, 3, 6, 10]],
    ["Cm9b5", [0, 2, 3, 6, 10]],
    ["Cdimmaj7", [0, 3, 6, 11]],
  ])("%s", (name, expected) => {
    expect(pcs(name)).toEqual(sorted(expected));
  });
});

describe("そのほかのテンション・変化音", () => {
  it.each([
    ["C9", [0, 2, 4, 7, 10]],
    ["Cmaj9", [0, 2, 4, 7, 11]],
    ["Cm9", [0, 2, 3, 7, 10]],
    ["C7b9", [0, 1, 4, 7, 10]],
    ["C7(♭9)", [0, 1, 4, 7, 10]],
    ["C7#9", [0, 3, 4, 7, 10]],
    ["C7b5", [0, 4, 6, 10]],
    ["Cmaj7#11", [0, 4, 6, 7, 11]],
    ["C7(9,13)", [0, 2, 4, 7, 9, 10]],
    ["C13", [0, 2, 4, 5, 7, 9, 10]],
    ["C11", [0, 2, 4, 5, 7, 10]],
    ["Cm11", [0, 2, 3, 5, 7, 10]],
    ["C9sus4", [0, 2, 5, 7, 10]],
    ["C7sus4", [0, 5, 7, 10]],
    ["C69", [0, 2, 4, 7, 9]],
    ["C6/9", [0, 2, 4, 7, 9]],
    ["Cmadd9", [0, 2, 3, 7]],
    ["CmM7", [0, 3, 7, 11]],
    ["Cm(maj7)", [0, 3, 7, 11]],
    ["CΔ7", [0, 4, 7, 11]],
    ["C5", [0, 7]],
    ["F#5", [6, 1]],
  ])("%s", (name, expected) => {
    expect(pcs(name)).toEqual(sorted(expected));
  });

  it("ルートが C 以外・分数コードとの組み合わせ", () => {
    expect(pcs("F#aug7")).toEqual(sorted([6, 10, 2, 4]));
    expect(pcs("Bbdim7")).toEqual(sorted([10, 1, 4, 7]));
    const slash = parseChord("G7b9/B")!;
    expect(slash.bass).toBe(11);
    expect(pcs("G7b9/B")).toEqual(sorted([7, 11, 2, 5, 8]));
  });

  it("今まで解析できたコードの結果は変わらない（表を優先）", () => {
    expect(parseChord("Cmaj7")!.quality.id).toBe("maj7");
    expect(parseChord("Am")!.quality.id).toBe("minor");
    expect(parseChord("Bm7b5")!.quality.id).toBe("m7b5");
  });

  it("解析できない名前は null のまま", () => {
    for (const n of ["Cfoo", "C7x", "Hm", "C#9#", "Caugaugfoo"]) expect(parseChord(n)).toBeNull();
  });

  it("日本語の説明が付く", () => {
    expect(parseChord("Caug7")!.quality.label).toBe("オーギュメント・セブンス");
    expect(parseChord("C7b9")!.quality.label).toBe("セブンス（♭9）");
    expect(parseChord("Cm9")!.quality.label).toBe("マイナー・ナインス");
    expect(parseChord("Cmaj7#11")!.quality.label).toBe("メジャーセブンス（♯11）");
    expect(parseChord("Cdim9")!.quality.label).toBe("ディミニッシュ・セブンス（9）");
    expect(parseChord("G13")!.quality.label).toBe("サーティーンス");
  });
});

describe("新しく解析できるコードもギターのフォームが作れる", () => {
  it.each([
    "Caug7",
    "Eaug7",
    "Gaugmaj7",
    "Cdim9",
    "Bdim7",
    "Cm7b5",
    "C9",
    "Dmaj9",
    "Am9",
    "G7b9",
    "E7#9",
    "A7b5",
    "Fmaj7#11",
    "G13",
    "D9sus4",
    "C6/9",
    "Cmadd9",
    "AmM7",
    "Caug9",
  ])("%s", (name) => {
    const forms = generateForms(name, { maxResults: 3 });
    expect(forms.length, `${name} の候補なし`).toBeGreaterThan(0);
    for (const f of forms) expect(analyzeForm(name, f.positions).valid, formShorthand(f.positions)).toBe(true);
  });
});
