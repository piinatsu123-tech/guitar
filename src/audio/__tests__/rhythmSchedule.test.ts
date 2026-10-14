import { describe, expect, it } from "vitest";
import { buildRhythmSchedule, buildSongRhythmSchedule } from "../schedule";
import { createEmptySong } from "../../model/factory";
import { parsePastedLyrics, sheetToSong } from "../../model/lyricSheet";
import { setLineRhythm } from "../../model/songOps";
import type { RhythmEvent } from "../../model/types";

const ev = (startTick: number, kind: "note" | "rest", guitarAction: RhythmEvent["guitarAction"]): RhythmEvent => ({
  id: `${startTick}`,
  startTick,
  durationTicks: 6,
  kind,
  guitarAction,
});

describe("buildRhythmSchedule（リズム譜を音程なしで1回通す）", () => {
  const rhythm = {
    lengthTicks: 96,
    events: [
      ev(0, "note", "downstroke"),
      ev(18, "note", "upstroke"),
      ev(24, "note", "none"),
      ev(30, "rest", "none"),
      ev(48, "note", "mute"),
      ev(60, "note", "pluck"),
    ],
  };
  it("弾く音符だけ打撃音にし、音程のある音は出さない。ループしない", () => {
    const s = buildRhythmSchedule(rhythm, 120, { numerator: 4, denominator: 4 });
    expect(s.events.map((e) => [e.kind, e.time, "stroke" in e ? e.stroke : ""])).toEqual([
      ["hit", 0, "down"],
      ["hit", 0.75, "up"],
      ["hit", 2, "mute"],
      ["hit", 2.5, "pluck"],
    ]);
    expect(s.duration).toBe(4); // 2小節 × 2秒
  });
  it("メトロノームは拍ごと、小節の頭を強く", () => {
    const s = buildRhythmSchedule(rhythm, 120, { numerator: 4, denominator: 4 }, { metronome: true });
    const clicks = s.events.filter((e) => e.kind === "click");
    expect(clicks.length).toBe(8);
    expect(clicks.filter((c) => c.kind === "click" && c.accent).map((c) => c.time)).toEqual([0, 2]);
  });
});

describe("buildSongRhythmSchedule（行ごとのリズム譜を通して鳴らす）", () => {
  it("リズム譜のある行はその長さ、ない行は歌詞の小節数だけ進む。cues で行・小節を追える", () => {
    const song = createEmptySong();
    const sheetSong = sheetToSong({ ...song, sections: [], tempo: 120 }, parsePastedLyrics("[A]\nあ|い\nう\nえ"));
    const sec = sheetSong.sections[0];
    const withRhythm = setLineRhythm(sheetSong, sec.id, 1, {
      lengthTicks: 96,
      events: [ev(0, "note", "downstroke"), ev(54, "note", "upstroke")],
    });
    const s = buildSongRhythmSchedule(withRhythm);
    // 1行目: 2小節（無音）→ 2行目: 2小節のリズム譜 → 3行目: 1小節（無音）。♩=120 で1小節2秒
    expect(s.duration).toBe(10);
    expect(s.events.map((e) => [e.kind, e.time])).toEqual([
      ["hit", 4],
      ["hit", 6.25],
    ]);
    expect(s.cues.map((c) => `${c.line}:${c.bar}@${c.time}`)).toEqual(["0:0@0", "0:1@2", "1:0@4", "1:1@6", "2:0@8"]);
    expect(
      buildSongRhythmSchedule(withRhythm, { metronome: true }).events.filter((e) => e.kind === "click").length,
    ).toBe(20);
  });
});
