// 歌詞シート：歌詞の行の上にコードを置く入力方法（U-FRET のような見た目）。
// シートは曲データの「別の見え方」で、独自のデータを持たない。
//   曲 → シート : songToSheet（コードの歌詞を行につなげ、コードの位置に印を置く）
//   シート → 曲 : sheetToSong（印ごとにコードを作る。元のコードは ID で引き継ぎ、長さ・フォーム・リズムを残す）
// まだコードを置いていない歌詞は「N.C.（コードなし）」のコードが持つ。
import { lyricsText, reconcileLyrics, splitGraphemes } from "../music/lyrics";
import { SIXTEENTH, ticksPerMeasure } from "../music/timeline";
import { makeChord, newId } from "./factory";
import { pruneForms } from "./songOps";
import type { ChordEvent, Section, Song } from "./types";

export const NO_CHORD = "N.C.";

export type SheetMark = {
  /** 行の何文字目の前にあるか（0〜文字数。文字数のときは行末＝歌詞のないコード） */
  at: number;
  name: string;
  chordId?: string;
};
export type SheetLine = { chars: string[]; marks: SheetMark[] };
export type SheetSection = { id?: string; name: string; lines: SheetLine[] };
export type Sheet = SheetSection[];
/**
 * シート上の位置。歌詞のないコードが続くと同じ位置に印が重なるので、
 * k で「その位置の何番目の印か」を指す（省略時は0）。k が印の数と同じなら、その位置に新しく足す。
 */
export type SheetPos = { section: number; line: number; at: number; k?: number };

/** その位置にある印（出てくる順） */
export function marksAt(sheet: Sheet, pos: Omit<SheetPos, "k">): SheetMark[] {
  return sheet[pos.section]?.lines[pos.line]?.marks.filter((mk) => mk.at === pos.at) ?? [];
}

/** 曲を歌詞シートにする */
export function songToSheet(song: Song): Sheet {
  return song.sections.map((section) => {
    const lines: SheetLine[] = [];
    let cur: SheetLine = { chars: [], marks: [] };
    for (const chord of section.chords) {
      cur.marks.push({ at: cur.chars.length, name: chord.chordName, chordId: chord.id });
      cur.chars.push(...splitGraphemes(lyricsText(chord.lyrics)));
      if (chord.lineBreak) {
        lines.push(cur);
        cur = { chars: [], marks: [] };
      }
    }
    if (cur.marks.length || cur.chars.length || lines.length === 0) lines.push(cur);
    return { id: section.id, name: section.name, lines };
  });
}

type Entry = { mark: SheetMark; text: string; lineBreak: boolean };

/**
 * 歌詞シートを曲に反映する。
 * 印のついたコードは元のコード（chordId）を引き継ぎ、歌詞だけを入れ替える。
 * 行頭の印より前の歌詞は、直前のコードの続き（そのコードを伸ばして歌う）として扱う。
 */
export function sheetToSong(song: Song, sheet: Sheet): Song {
  const m = ticksPerMeasure(song.timeSignature);
  const byId = new Map<string, ChordEvent>();
  for (const s of song.sections) for (const c of s.chords) byId.set(c.id, c);

  const sections: Section[] = sheet.map((ss) => {
    const entries: Entry[] = [];
    for (const line of ss.lines) {
      const marks = [...line.marks].sort((a, b) => a.at - b.at);
      const lead = line.chars.slice(0, marks[0]?.at ?? line.chars.length).join("");
      if (lead) {
        const prev = entries[entries.length - 1];
        if (prev) prev.text += lead;
        else entries.push({ mark: { at: 0, name: NO_CHORD }, text: lead, lineBreak: false });
      }
      marks.forEach((mark, i) => {
        const end = marks[i + 1]?.at ?? line.chars.length;
        entries.push({ mark, text: line.chars.slice(mark.at, end).join(""), lineBreak: false });
      });
      const last = entries[entries.length - 1];
      if (last) last.lineBreak = true;
    }
    const chords = entries.map(({ mark, text, lineBreak }) => {
      const old = mark.chordId ? byId.get(mark.chordId) : undefined;
      if (!old) {
        return { ...makeChord(mark.name, m, text), lineBreak: lineBreak || undefined };
      }
      return {
        ...old,
        chordName: mark.name,
        formId: old.chordName === mark.name ? old.formId : undefined,
        lyrics: reconcileLyrics(old.lyrics, text, old.durationTicks, SIXTEENTH, newId),
        lineBreak: lineBreak || undefined,
      };
    });
    const existing = ss.id ? song.sections.find((s) => s.id === ss.id) : undefined;
    return existing ? { ...existing, name: ss.name, chords } : { id: newId(), name: ss.name, chords };
  });
  return pruneForms({ ...song, sections: sections.filter((s) => s.chords.length > 0) });
}

const HEADER = /^\s*(?:\[(.+)\]|【(.+)】|［(.+)］|<(.+)>|＜(.+)＞)\s*$/;

/**
 * 貼り付けた歌詞をシートにする。
 * [Aメロ]・【サビ】・<間奏> のような行はセクション名、空行はセクションの区切り。
 * 各行は、まだコードのない「N.C.」1つで始まる。
 */
export function parsePastedLyrics(text: string): Sheet {
  const sheet: Sheet = [];
  let cur: SheetSection | null = null;
  let auto = 0;
  const start = (name?: string) => {
    cur = { name: name ?? `セクション${++auto}`, lines: [] };
    sheet.push(cur);
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const header = HEADER.exec(raw);
    if (header) {
      start(header.slice(1).find(Boolean)!.trim());
      continue;
    }
    const line = raw.trim();
    if (!line) {
      // 空行：今のセクションに行があれば区切る
      if (cur && (cur as SheetSection).lines.length) cur = null;
      continue;
    }
    if (!cur) start();
    cur!.lines.push({ chars: splitGraphemes(line), marks: [{ at: 0, name: NO_CHORD }] });
  }
  return sheet.filter((s) => s.lines.length > 0);
}

// ---- シートの編集（純粋関数） ----

/** 印の配列の中で、pos が指す印の添字（なければ -1） */
function markIndex(line: SheetLine, pos: SheetPos): number {
  let n = 0;
  for (let i = 0; i < line.marks.length; i++) {
    if (line.marks[i].at !== pos.at) continue;
    if (n === (pos.k ?? 0)) return i;
    n++;
  }
  return -1;
}

/**
 * 位置にコードを置く。pos が指す印があれば名前を変え（元のコードを引き継ぐ）、
 * なければその位置の最後の印の後ろに足す。
 */
export function setMark(sheet: Sheet, pos: SheetPos, name: string): Sheet {
  return mapLine(sheet, pos, (line) => {
    const i = markIndex(line, pos);
    const marks = [...line.marks];
    if (i >= 0) marks[i] = { ...marks[i], name };
    else {
      // 同じ位置の印の並び（＝演奏順）を保つため、その位置以前の最後の印の直後に入れる
      let at = 0;
      while (at < marks.length && marks[at].at <= pos.at) at++;
      marks.splice(at, 0, { at: pos.at, name });
    }
    return { ...line, marks };
  });
}

/** pos が指す印（コード）を1つだけ取り除く（その歌詞は前のコードの続きになる） */
export function removeMark(sheet: Sheet, pos: SheetPos): Sheet {
  return mapLine(sheet, pos, (line) => {
    const i = markIndex(line, pos);
    return i < 0 ? line : { ...line, marks: line.marks.filter((_, j) => j !== i) };
  });
}

/** 行末（歌詞のないところ）に、もう1つコードを足す（前奏・間奏など） */
export function addEndMark(sheet: Sheet, pos: Omit<SheetPos, "at">, name: string): Sheet {
  return mapLine(sheet, { ...pos, at: 0 }, (line) => ({
    ...line,
    marks: [...line.marks, { at: line.chars.length, name }],
  }));
}

function mapLine(sheet: Sheet, pos: SheetPos, fn: (l: SheetLine) => SheetLine): Sheet {
  return sheet.map((s, si) =>
    si !== pos.section ? s : { ...s, lines: s.lines.map((l, li) => (li === pos.line ? fn(l) : l)) },
  );
}
