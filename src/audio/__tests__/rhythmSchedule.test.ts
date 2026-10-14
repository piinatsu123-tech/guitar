import { describe, expect, it } from "vitest";
import { buildRhythmSchedule } from "../schedule";
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
