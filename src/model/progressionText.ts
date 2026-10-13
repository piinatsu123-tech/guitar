// コード進行のテキスト表記（一括入力用）。
//   "| C | G | Am Em | F |"  … 小節を | で区切り、小節内のコードは等分
//   "| C - - G |"            … "-" は直前のコードを1区分伸ばす（C 3拍 + G 1拍）
//   "| C | - |"              … 小節をまたいで伸ばす（C 2小節）
import { clampLyrics } from "../music/lyrics";
import { measuresOfSection, SIXTEENTH, ticksPerMeasure } from "../music/timeline";
import { makeChord } from "./factory";
import type { ChordEvent, Section, TimeSignature } from "./types";

export type ParsedProgression = { chordName: string; durationTicks: number }[];

export function parseProgressionText(text: string, ts: TimeSignature): ParsedProgression {
  const m = ticksPerMeasure(ts);
  const bars = text
    .split(/[|\n｜]/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const out: ParsedProgression = [];
  bars.forEach((bar, bi) => {
    const tokens = bar.split(/\s+/);
    if (m % tokens.length !== 0) {
      throw new Error(`${bi + 1}小節目: ${tokens.length}等分できません（1小節 = ${m} tick）`);
    }
    const unit = m / tokens.length;
    for (const tok of tokens) {
      if (tok === "-" || tok === "−" || tok === "ー") {
        if (out.length === 0) throw new Error(`${bi + 1}小節目: 先頭の "-" には伸ばすコードがありません`);
        out[out.length - 1].durationTicks += unit;
      } else {
        out.push({ chordName: tok, durationTicks: unit });
      }
    }
  });
  return out;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** セクションのコードをテキスト表記にする（parseProgressionText と往復可能） */
export function progressionToText(section: Section, ts: TimeSignature): string {
  const m = ticksPerMeasure(ts);
  const measures = measuresOfSection(section, ts);
  const bars = measures.map((slots) => {
    let g = m;
    for (const s of slots) g = gcd(gcd(g, s.start), s.length);
    const used = slots.reduce((a, s) => a + s.length, 0);
    if (used < m) g = gcd(g, m - used);
    const tokens: string[] = [];
    for (const s of slots) {
      const n = s.length / g;
      tokens.push(s.continued ? "-" : s.chordName);
      for (let i = 1; i < n; i++) tokens.push("-");
    }
    return tokens.join(" ");
  });
  return bars.length ? `| ${bars.join(" | ")} |` : "";
}

/**
 * テキストから作ったコード列を既存のコードと位置で対応づけ、ID・歌詞・フォーム指定を引き継ぐ。
 * コード名が変わった位置はフォーム指定を外す（別のコードのフォームが残らないように）。
 */
export function applyProgression(previous: ChordEvent[], parsed: ParsedProgression): ChordEvent[] {
  return parsed.map((p, i) => {
    const old = previous[i];
    if (!old) return makeChord(p.chordName, p.durationTicks);
    return {
      ...old,
      chordName: p.chordName,
      durationTicks: p.durationTicks,
      formId: old.chordName === p.chordName ? old.formId : undefined,
      lyrics: clampLyrics(old.lyrics, p.durationTicks, SIXTEENTH),
    };
  });
}
