import { describe, expect, it } from "vitest";
import { lyricsText } from "../../music/lyrics";
import { createEmptySong, makeChord, makeSection } from "../factory";
import {
  addPatternFromRhythm,
  mergeWithPrevious,
  moveChordEnd,
  moveChordStart,
  patternToRhythm,
  setChordDuration,
} from "../songOps";
import type { LyricEvent, Song } from "../types";

const L = (text: string, startTick: number): LyricEvent => ({
  id: `${text}${startTick}`,
  text,
  startTick,
  accentMarked: false,
});

/** C（1小節）に「あいうえ」が4分ごと、G（1小節）に「かき」 */
function song(): Song {
  const c = { ...makeChord("C", 48), lyrics: [L("あ", 0), L("い", 12), L("う", 24), L("え", 36)] };
  const g = { ...makeChord("G", 48), lyrics: [L("か", 0), L("き", 24)] };
  const am = makeChord("Am", 48);
  return { ...createEmptySong(), sections: [makeSection("A", [c, g, am])] };
}
/** 曲の中の位置（セクション先頭から）で歌詞を並べる */
function timeline(s: Song) {
  let at = 0;
  const out: string[] = [];
  for (const c of s.sections[0].chords) {
    out.push(`[${c.chordName}@${at}]`);
    for (const l of c.lyrics) out.push(`${l.text}@${at + l.startTick}`);
    at += c.durationTicks;
  }
  return out.join(" ");
}

describe("コードの切り替え位置を動かす", () => {
  it("G の始まりを2拍早くすると、C の後半の歌詞は G に移り、曲の中の位置は変わらない", () => {
    const s = song();
    const g = s.sections[0].chords[1];
    const next = moveChordStart(s, g.id, -24)!;
    expect(timeline(next)).toBe("[C@0] あ@0 い@12 [G@24] う@24 え@36 か@48 き@72 [Am@96]");
    expect(lyricsText(next.sections[0].chords[1].lyrics)).toBe("うえかき");
    // 全体の長さは同じ
    expect(next.sections[0].chords.reduce((a, c) => a + c.durationTicks, 0)).toBe(144);
  });

  it("遅くすると G の最初の歌詞が C に移る。元に戻すと元どおり", () => {
    const s = song();
    const g = s.sections[0].chords[1];
    const later = moveChordStart(s, g.id, 6)!;
    expect(timeline(later)).toBe("[C@0] あ@0 い@12 う@24 え@36 か@48 [G@54] き@72 [Am@96]");
    expect(timeline(moveChordStart(later, g.id, -6)!)).toBe(timeline(s));
  });

  it("コードの終わりを動かす：後ろにコードがあれば切り替え位置、最後のコードなら長さ", () => {
    const s = song();
    const [c, , am] = s.sections[0].chords;
    expect(timeline(moveChordEnd(s, c.id, -12)!)).toBe(timeline(moveChordStart(s, s.sections[0].chords[1].id, -12)!));
    expect(moveChordEnd(s, am.id, 12)!.sections[0].chords[2].durationTicks).toBe(60);
  });

  it("動かせないとき（最初のコードの始まり・16分未満になる）は null", () => {
    const s = song();
    const [c, g] = s.sections[0].chords;
    expect(moveChordStart(s, c.id, 3)).toBeNull();
    expect(moveChordStart(s, g.id, 48)).toBeNull();
    expect(moveChordStart(s, g.id, -48)).toBeNull();
  });
});

describe("長さを縮めても歌詞は消えない", () => {
  it("はみ出した文字は末尾に16分間隔で詰める（順番どおり、重ならない）", () => {
    const s = song();
    const c = s.sections[0].chords[0];
    const next = setChordDuration(s, c.id, 24); // 2拍に
    const ly = next.sections[0].chords[0].lyrics;
    expect(ly.map((l) => l.text).join("")).toBe("あいうえ");
    expect(ly.map((l) => l.startTick)).toEqual([0, 12, 18, 21]);
  });

  it("前のコードとつなげると、長さと歌詞が前のコードに入る", () => {
    const s = song();
    const g = s.sections[0].chords[1];
    const next = mergeWithPrevious(s, g.id)!;
    expect(timeline(next)).toBe("[C@0] あ@0 い@12 う@24 え@36 か@48 き@72 [Am@96]");
    expect(mergeWithPrevious(s, s.sections[0].chords[0].id)).toBeNull();
  });
});

describe("パターンからリズム譜を作る", () => {
  it("1小節のパターンを2小節に敷き詰める。半小節のパターンはくり返す", () => {
    const song = createEmptySong();
    const p = song.rhythmPatterns[0];
    const r = patternToRhythm(p, 2, 48);
    expect(r.lengthTicks).toBe(96);
    expect(r.events.length).toBe(p.events.length * (96 / p.lengthTicks));
    const half = {
      ...p,
      lengthTicks: 24,
      events: [
        { id: "x", startTick: 0, durationTicks: 24, kind: "note" as const, guitarAction: "downstroke" as const },
      ],
    };
    expect(patternToRhythm(half, 1, 48).events.map((e) => e.startTick)).toEqual([0, 24]);
  });
  it("リズム譜をパターンとして登録できる", () => {
    const song = createEmptySong();
    const next = addPatternFromRhythm(song, "サビ", {
      lengthTicks: 48,
      events: [{ id: "a", startTick: 0, durationTicks: 48, kind: "note", guitarAction: "downstroke" }],
    });
    expect(next.rhythmPatterns.length).toBe(song.rhythmPatterns.length + 1);
    expect(next.rhythmPatterns.at(-1)!.name).toBe("サビ");
  });
});
