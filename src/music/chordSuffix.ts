// コード名のサフィックス（ルート音より後ろ）を、構成音に分解する汎用パーサー。
// 決まった表（CHORD_QUALITIES）にない名前（aug7・dim9・7♭9・maj7♯11・C6/9 など）を解析する。
//
// 文法（順不同のところは柔軟に読む）:
//   基本   : (なし)=メジャー / m・min・- / dim・o・° / aug・+ / sus2・sus4・sus
//   7th等  : 7 / maj7・M7・Δ7 / 6 / 69 / 9・11・13（7th を含む）/ maj9・maj11・maj13
//   変化音 : ♭5 ♯5 +5 -5 ♭9 ♯9 ♯11 ♭13 / add2 add4 add9 add11 add13 / sus（7sus4 など後置も可）
//   括弧・カンマは区切りとして無視する（7(♭9,♯11) = 7♭9♯11）
import type { ChordQuality } from "./chord";

type Third = "major" | "minor" | "sus2" | "sus4";
type Fifth = "perfect" | "dim" | "aug";

const BASE_LABEL: Record<string, string> = {
  major: "メジャー",
  minor: "マイナー",
  dim: "ディミニッシュ",
  aug: "オーギュメント",
  sus2: "サスツー",
  sus4: "サスフォー",
};

function normalize(s: string): string {
  return s
    .replace(/[♯]/g, "#")
    .replace(/[♭]/g, "b")
    .replace(/[()（）,、\s]/g, "")
    .replace(/[Δ△]/g, "maj")
    .replace(/°/g, "dim")
    .replace(/^ø7?/, "m7b5");
}

/** サフィックスを解析する。解析できない文字が残れば null。 */
export function parseSuffix(raw: string): ChordQuality | null {
  let s = normalize(raw);
  let third: Third = "major";
  let fifth: Fifth = "perfect";
  let base = "major";

  // ---- 基本の種類 ----
  if (/^(mM|mmaj|minmaj|-maj|-M)(?=\d|$)/.test(s)) {
    third = "minor";
    base = "minor";
    s = s.replace(/^(mM|mmaj|minmaj|-maj|-M)/, "maj"); // 後ろの maj7 として読む
    if (!/^maj\d/.test(s)) s = s.replace(/^maj/, "maj7");
  } else if (/^dim/.test(s) || /^o(?=\d|$)/.test(s)) {
    third = "minor";
    fifth = "dim";
    base = "dim";
    s = s.replace(/^(dim|o)/, "");
  } else if (/^aug/.test(s) || /^\+/.test(s)) {
    fifth = "aug";
    base = "aug";
    s = s.replace(/^(aug|\+)/, "");
  } else if (/^(min|m(?!aj)|-)/.test(s)) {
    third = "minor";
    base = "minor";
    s = s.replace(/^(min|m|-)/, "");
  }

  // ---- 7th・6th・テンション ----
  let seventh: "none" | "minor7" | "major7" | "dim7" = "none";
  let sixth = false;
  let ext: 9 | 11 | 13 | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(maj|M)(7|9|11|13)/.exec(s))) {
    seventh = "major7";
    if (m[2] !== "7") ext = Number(m[2]) as 9 | 11 | 13;
    s = s.slice(m[0].length);
  } else if ((m = /^69/.exec(s))) {
    sixth = true;
    ext = 9;
    s = s.slice(2);
  } else if ((m = /^6/.exec(s))) {
    sixth = true;
    s = s.slice(1);
  } else if ((m = /^(7|9|11|13)/.exec(s))) {
    seventh = base === "dim" ? "dim7" : "minor7";
    if (m[1] !== "7") ext = Number(m[1]) as 9 | 11 | 13;
    s = s.slice(m[0].length);
  }

  // ---- 変化音・add・sus（順不同） ----
  const added = new Set<number>(); // 半音（0〜11）
  const altered = new Set<string>();
  while (s.length > 0) {
    if ((m = /^sus(2|4)?/.exec(s))) {
      third = m[1] === "2" ? "sus2" : "sus4";
      if (base === "major") base = third;
    } else if ((m = /^(b|-)5/.exec(s))) {
      fifth = "dim";
      altered.add("♭5");
    } else if ((m = /^(#|\+)5/.exec(s)) || (m = /^aug/.exec(s))) {
      fifth = "aug";
      altered.add("♯5");
    } else if ((m = /^b9/.exec(s))) {
      added.add(1);
      altered.add("♭9");
    } else if ((m = /^#9/.exec(s))) {
      added.add(3);
      altered.add("♯9");
    } else if ((m = /^#11/.exec(s))) {
      added.add(6);
      altered.add("♯11");
    } else if ((m = /^b13/.exec(s))) {
      added.add(8);
      altered.add("♭13");
    } else if ((m = /^add(2|4|9|11|13)/.exec(s))) {
      const iv = { "2": 2, "9": 2, "4": 5, "11": 5, "13": 9 }[m[1]]!;
      added.add(iv);
      altered.add(`add${m[1]}`);
    } else if ((m = /^(9|11|13)/.exec(s)) && (seventh !== "none" || sixth)) {
      // 7(9,13) のような括弧書きのテンションは、書かれた音だけを足す（13 でも 11th は足さない）
      added.add({ "9": 2, "11": 5, "13": 9 }[m[1]]!);
      altered.add(m[1]);
    } else {
      return null;
    }
    s = s.slice(m[0].length);
  }

  // ---- 構成音（ルートからの半音、0〜11） ----
  const thirdIv = { major: 4, minor: 3, sus2: 2, sus4: 5 }[third];
  const fifthIv = { perfect: 7, dim: 6, aug: 8 }[fifth];
  const intervals = new Set<number>([0, thirdIv, fifthIv]);
  if (sixth) intervals.add(9);
  if (seventh === "minor7") intervals.add(10);
  if (seventh === "major7") intervals.add(11);
  if (seventh === "dim7") intervals.add(9);
  // 9・11・13 は下のテンションを含む（ただし変化音で指定した音はそちらを使う）
  const has9Alt = added.has(1) || added.has(3);
  if (ext && ext >= 9 && !has9Alt) intervals.add(2);
  if (ext && ext >= 11 && !added.has(6)) intervals.add(5);
  if (ext === 13 && !added.has(8)) intervals.add(9);
  for (const iv of added) intervals.add(iv);

  // ---- ギターで省略してよい音 ----
  // 完全5度は、4和音以上なら省略可。11th では 9th、13th では 9th・11th も省略可（よく省かれる音）。
  const optional = new Set<number>();
  if (fifth === "perfect" && intervals.size >= 4) optional.add(7);
  if (ext === 11 && !has9Alt) optional.add(2);
  // 長3度と11th はぶつかるので、ドミナント／メジャーの 11th では3度も省略してよい
  if (ext === 11 && third === "major" && !added.has(6)) optional.add(4);
  if (ext === 13) {
    if (!has9Alt) optional.add(2);
    if (!added.has(6)) optional.add(5);
  }

  const EXT_NAME = { 9: "ナインス", 11: "イレブンス", 13: "サーティーンス" } as const;
  const sevenLabel = sixth
    ? ext === 9
      ? "シックス・ナインス"
      : "シックス"
    : seventh === "major7"
      ? ext
        ? `メジャー${EXT_NAME[ext]}`
        : "メジャーセブンス"
      : seventh === "dim7"
        ? ext
          ? `セブンス（${ext}）`
          : "セブンス"
        : seventh === "minor7"
          ? ext
            ? EXT_NAME[ext]
            : "セブンス"
          : "";
  // C7 は「セブンス」、Cmaj9 は「メジャーナインス」と呼ぶので、メジャーの3和音名は付けない
  const baseLabel = base === "major" && sevenLabel ? "" : BASE_LABEL[base];
  const label =
    [baseLabel, sevenLabel].filter(Boolean).join("・") + (altered.size ? `（${[...altered].join("・")}）` : "");

  return {
    id: `custom:${raw}`,
    suffixes: [raw],
    label,
    intervals: [...intervals].sort((a, b) => a - b),
    optional: [...optional],
  };
}
