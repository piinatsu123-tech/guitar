import { describe, expect, it } from "vitest";
import { lyricsText } from "../../music/lyrics";
import { createEmptySong, makeChord, makeSection } from "../factory";
import {
  addEndMark,
  NO_CHORD,
  parsePastedLyrics,
  removeMark,
  setLineText,
  setMark,
  toggleBar,
  barCount,
  sheetToSong,
  songToSheet,
  type Sheet,
} from "../lyricSheet";
import { saveForm, setChordDuration, toggleLyricAccent } from "../songOps";
import type { Song } from "../types";

const summary = (s: Song) =>
  s.sections.map((sec) => ({
    name: sec.name,
    chords: sec.chords.map((c) => `${c.chordName}:${lyricsText(c.lyrics)}${c.lineBreak ? "⏎" : ""}`),
  }));

function fromPaste(text: string): Song {
  const base = { ...createEmptySong("t"), sections: [] };
  return sheetToSong(base, parsePastedLyrics(text));
}

describe("歌詞の貼り付け", () => {
  it("見出しはセクション名、空行は区切り、各行は N.C. で始まる", () => {
    const s = fromPaste("[Aメロ]\nあさのひかり\nまどをたたく\n\nねむいめを\n【サビ】\nひかりのなかへ\n");
    expect(summary(s)).toEqual([
      { name: "Aメロ", chords: [`${NO_CHORD}:あさのひかり⏎`, `${NO_CHORD}:まどをたたく⏎`] },
      { name: "セクション1", chords: [`${NO_CHORD}:ねむいめを⏎`] },
      { name: "サビ", chords: [`${NO_CHORD}:ひかりのなかへ⏎`] },
    ]);
    expect(s.sections[0].chords[0].durationTicks).toBe(48);
  });
});

describe("歌詞シートでコードを置く", () => {
  const base = () => fromPaste("あさのひかり\nまどをたたく");

  it("行頭の N.C. を C に、途中の「ひ」に G を置く", () => {
    let s = base();
    let sheet = songToSheet(s);
    sheet = setMark(sheet, { section: 0, line: 0, at: 0 }, "C");
    sheet = setMark(sheet, { section: 0, line: 0, at: 3 }, "G");
    s = sheetToSong(s, sheet);
    expect(summary(s)[0].chords).toEqual(["C:あさの", "G:ひかり⏎", `${NO_CHORD}:まどをたたく⏎`]);
  });

  it("シートと曲を行き来しても同じ（往復）", () => {
    let s = base();
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 0, at: 3 }, "G"));
    expect(sheetToSong(s, songToSheet(s))).toEqual(s);
  });

  it("名前を変えても元のコードを引き継ぐ（長さ・フォーム指定はそのまま、歌詞の位置も残る）", () => {
    let s = base();
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 0, at: 0 }, "C"));
    const c = s.sections[0].chords[0];
    s = setChordDuration(s, c.id, 24);
    s = saveForm(s, { chordName: "C", frets: [null, 3, 2, 0, 1, 0] }, { applyToAll: true }).song;
    const ticks = s.sections[0].chords[0].lyrics.map((l) => l.startTick);
    // 別の位置にコードを足す
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 1, at: 2 }, "Am"));
    const c2 = s.sections[0].chords[0];
    expect(c2.id).toBe(c.id);
    expect(c2.durationTicks).toBe(24);
    expect(c2.formId).toBeDefined();
    expect(c2.lyrics.map((l) => l.startTick)).toEqual(ticks);
    expect(summary(s)[0].chords).toEqual(["C:あさのひかり⏎", `${NO_CHORD}:まど`, "Am:をたたく⏎"]);
  });

  it("コードを取り除くと、その歌詞は前のコードの続きになる", () => {
    let s = base();
    let sheet = setMark(songToSheet(s), { section: 0, line: 0, at: 0 }, "C");
    sheet = setMark(sheet, { section: 0, line: 0, at: 3 }, "G");
    s = sheetToSong(s, sheet);
    s = sheetToSong(s, removeMark(songToSheet(s), { section: 0, line: 0, at: 3 }));
    expect(summary(s)[0].chords).toEqual(["C:あさのひかり⏎", `${NO_CHORD}:まどをたたく⏎`]);
    // 2行目の行頭の N.C. を取ると、2行目の歌詞は1行目の C の続き
    s = sheetToSong(s, removeMark(songToSheet(s), { section: 0, line: 1, at: 0 }));
    expect(summary(s)[0].chords).toEqual(["C:あさのひかりまどをたたく⏎"]);
  });

  it("行末に歌詞のないコード（前奏など）を足せる", () => {
    let s = base();
    let sheet = setMark(songToSheet(s), { section: 0, line: 0, at: 0 }, "C");
    sheet = addEndMark(sheet, { section: 0, line: 0 }, "F");
    sheet = addEndMark(sheet, { section: 0, line: 0 }, "G");
    s = sheetToSong(s, sheet);
    expect(summary(s)[0].chords).toEqual(["C:あさのひかり", "F:", "G:⏎", `${NO_CHORD}:まどをたたく⏎`]);
    // 往復しても行の構成が変わらない
    expect(summary(sheetToSong(s, songToSheet(s)))).toEqual(summary(s));
  });

  it("既存の曲（改行の印なし）もシートで開ける（セクションごとに1行）", () => {
    const s0 = createEmptySong("t");
    const s = { ...s0, sections: [makeSection("A", [makeChord("C", 48, "あい"), makeChord("G", 48, "う")])] };
    const sheet = songToSheet(s);
    expect(sheet[0].lines).toHaveLength(1);
    expect(sheet[0].lines[0].marks.map((mk) => [mk.at, mk.name])).toEqual([
      [0, "C"],
      [2, "G"],
    ]);
  });
});

describe("歌詞のないコードが同じ位置に重なるとき", () => {
  const song = (): Song => {
    const s = createEmptySong();
    const m = 48;
    return {
      ...s,
      sections: [
        makeSection("間奏", [makeChord("Dm", m), makeChord("G", m), makeChord("Cmaj7", m), makeChord("C", m)]),
      ],
    };
  };
  const names = (s: Song) => s.sections[0].chords.map((c) => c.chordName);

  it("取り除くのは指した1つだけ（以前は同じ位置のコードがすべて消えていた）", () => {
    let s = song();
    s = sheetToSong(s, removeMark(songToSheet(s), { section: 0, line: 0, at: 0 }));
    expect(names(s)).toEqual(["G", "Cmaj7", "C"]);
    s = sheetToSong(s, removeMark(songToSheet(s), { section: 0, line: 0, at: 0, k: 1 }));
    expect(names(s)).toEqual(["G", "C"]);
  });

  it("k 番目の名前を変える・同じ位置にもう1つ足す（順番を保つ）", () => {
    let s = song();
    const ids = s.sections[0].chords.map((c) => c.id);
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 0, at: 0, k: 2 }, "Am"));
    expect(names(s)).toEqual(["Dm", "G", "Am", "C"]);
    expect(s.sections[0].chords.map((c) => c.id)).toEqual(ids);
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 0, at: 0, k: 4 }, "G7"));
    expect(names(s)).toEqual(["Dm", "G", "Am", "C", "G7"]);
  });
});

describe("行の歌詞を書き換える", () => {
  const line = (chars: string, marks: [number, string][]): Sheet => [
    { name: "A", lines: [{ chars: [...chars], marks: marks.map(([at, name]) => ({ at, name })) }] },
  ];
  const marksOf = (s: Sheet) => s[0].lines[0].marks.map((m) => `${m.at}${m.name}`);

  it("前後が同じならコードは同じ文字の上に残る", () => {
    // 「あさのひかり」→「あさのまぶしいひかり」：「ひ」の上の G は「ひ」に付いていく
    const s = setLineText(
      line("あさのひかり", [
        [0, "C"],
        [3, "G"],
      ]),
      { section: 0, line: 0 },
      "あさのまぶしいひかり",
    );
    expect(s[0].lines[0].chars.join("")).toBe("あさのまぶしいひかり");
    expect(marksOf(s)).toEqual(["0C", "7G"]);
  });

  it("消した部分にあったコードは範囲内に寄せる。行末のコードは行末のまま", () => {
    const s = setLineText(
      line("あいうえお", [
        [2, "Am"],
        [5, "F"],
      ]),
      { section: 0, line: 0 },
      "あお",
    );
    expect(marksOf(s)).toEqual(["1Am", "2F"]);
  });
});

describe("小節の区切り（歌詞の行の中）", () => {
  it("貼り付けの「|」「｜」で区切れ、曲に保存して読み直しても残る", () => {
    const s = fromPaste("[A]\nあさの|ひかり｜まど\nねむい");
    const sheet = songToSheet(s);
    expect(sheet[0].lines[0].chars.join("")).toBe("あさのひかりまど");
    expect(sheet[0].lines[0].bars).toEqual([3, 6]);
    expect(barCount(sheet[0].lines[0])).toBe(3);
    expect(barCount(sheet[0].lines[1])).toBe(1);
    expect(s.sections[0].lineBars).toEqual([{ line: 0, starts: [3, 6] }]);
  });

  it("文字の前で区切る／もう一度で消す。行頭は区切れない", () => {
    let s = fromPaste("[A]\nあさのひかり");
    s = sheetToSong(s, toggleBar(songToSheet(s), { section: 0, line: 0, at: 3 }));
    expect(songToSheet(s)[0].lines[0].bars).toEqual([3]);
    s = sheetToSong(s, toggleBar(songToSheet(s), { section: 0, line: 0, at: 0 }));
    expect(songToSheet(s)[0].lines[0].bars).toEqual([3]);
    s = sheetToSong(s, toggleBar(songToSheet(s), { section: 0, line: 0, at: 3 }));
    expect(songToSheet(s)[0].lines[0].bars).toBeUndefined();
    expect(s.sections[0].lineBars).toBeUndefined();
  });

  it("コードを置いても、行の歌詞を直しても、区切りは同じ文字の前に残る", () => {
    let s = fromPaste("[A]\nあさの|ひかり");
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 0, at: 3 }, "G"));
    expect(songToSheet(s)[0].lines[0].bars).toEqual([3]);
    s = sheetToSong(s, setLineText(songToSheet(s), { section: 0, line: 0 }, "あさのまぶしいひかり"));
    expect(songToSheet(s)[0].lines[0].bars).toEqual([7]);
  });
});

describe("歌詞のアクセント（ここで弾く印）", () => {
  it("文字ごとにコードと歌詞を指し、付けた印はコードを置いても行を直しても残る", () => {
    let s = fromPaste("[A]\nあさのひかり");
    const ref = songToSheet(s)[0].lines[0].refs![3]; // 「ひ」
    s = toggleLyricAccent(s, ref.chordId, ref.lyricId);
    expect(songToSheet(s)[0].lines[0].refs!.map((r) => r.accent)).toEqual([false, false, false, true, false, false]);
    s = sheetToSong(s, setMark(songToSheet(s), { section: 0, line: 0, at: 3 }, "G"));
    expect(songToSheet(s)[0].lines[0].refs!.map((r) => r.accent)).toEqual([false, false, false, true, false, false]);
    s = sheetToSong(s, setLineText(songToSheet(s), { section: 0, line: 0 }, "あさのまぶしいひかり"));
    expect(songToSheet(s)[0].lines[0].refs!.findIndex((r) => r.accent)).toBe(7);
    // もう一度で外れる
    const r2 = songToSheet(s)[0].lines[0].refs![7];
    s = toggleLyricAccent(s, r2.chordId, r2.lyricId);
    expect(songToSheet(s)[0].lines[0].refs!.some((r) => r.accent)).toBe(false);
  });
});
