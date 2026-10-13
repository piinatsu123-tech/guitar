import { describe, expect, it } from "vitest";
import type { LyricEvent } from "../../model/types";
import {
  clampLyrics,
  distributeTicks,
  groupLyricsByTick,
  lyricsText,
  reconcileLyrics,
  splitGraphemes,
  toggleAccent,
} from "../lyrics";

let n = 0;
const id = () => `l${n++}`;

describe("歌詞", () => {
  it("書記素単位に分割する", () => {
    expect(splitGraphemes("かえるのうた")).toHaveLength(6);
    expect(splitGraphemes("が")).toHaveLength(1);
    expect(splitGraphemes("👍🏽あ")).toHaveLength(2);
  });

  it("均等配置（16分単位、範囲内）", () => {
    expect(distributeTicks(4, 48, 3)).toEqual([0, 12, 24, 36]);
    expect(distributeTicks(3, 24, 3)).toEqual([0, 9, 15]);
    for (const t of distributeTicks(20, 12, 3)) expect(t).toBeLessThanOrEqual(9);
  });

  it("文字をタップするとマーク、再タップで解除（複数選択可）", () => {
    let ev = reconcileLyrics([], "かえるのうたが", 48, 3, id);
    const [ka, , , no, u] = ev;
    ev = toggleAccent(ev, ka.id);
    ev = toggleAccent(ev, no.id);
    ev = toggleAccent(ev, u.id);
    expect(ev.filter((e) => e.accentMarked).map((e) => e.text)).toEqual(["か", "の", "う"]);
    ev = toggleAccent(ev, no.id);
    expect(ev.filter((e) => e.accentMarked).map((e) => e.text)).toEqual(["か", "う"]);
  });

  it("テキスト編集時に既存の文字の ID・位置・マークを引き継ぐ", () => {
    let ev = reconcileLyrics([], "かえるのうた", 48, 3, id);
    ev = ev.map((e) => (e.text === "う" ? { ...e, accentMarked: true, startTick: 33 } : e));
    const before = new Map(ev.map((e) => [e.text, e]));
    const next = reconcileLyrics(ev, "かえるのうたが", 48, 3, id);
    expect(lyricsText(next)).toBe("かえるのうたが");
    expect(next.find((e) => e.text === "う")).toEqual(before.get("う"));
    expect(next.find((e) => e.text === "か")!.id).toBe(before.get("か")!.id);
    const ga = next.find((e) => e.text === "が")!;
    expect(ga.startTick).toBeGreaterThanOrEqual(before.get("た")!.startTick);
    expect(ga.startTick).toBeLessThan(48);
    // 途中への挿入
    const mid = reconcileLyrics(next, "かえるのXうたが", 48, 3, id);
    expect(lyricsText(mid)).toBe("かえるのXうたが");
    const x = mid.find((e) => e.text === "X")!;
    expect(x.startTick).toBeGreaterThanOrEqual(before.get("の")!.startTick);
    expect(x.startTick).toBeLessThanOrEqual(33);
  });

  it("同じ位置の文字はまとめて表示（1つの音に複数の文字）", () => {
    const ev: LyricEvent[] = [
      { id: "a", text: "き", startTick: 0, accentMarked: false },
      { id: "b", text: "ょ", startTick: 0, accentMarked: false },
      { id: "c", text: "う", startTick: 12, accentMarked: false },
    ];
    expect(groupLyricsByTick(ev).map((g) => [g.startTick, g.chars.map((c) => c.text).join("")])).toEqual([
      [0, "きょ"],
      [12, "う"],
    ]);
  });

  it("コードを短くしたとき範囲外の文字を収める", () => {
    const ev: LyricEvent[] = [{ id: "a", text: "あ", startTick: 40, accentMarked: false }];
    expect(clampLyrics(ev, 24, 3)[0].startTick).toBe(21);
  });
});
