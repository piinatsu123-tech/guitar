import { describe, expect, it } from "vitest";
import { autoDirection, describeTiming, detectFeel, estimateOffset, transcribeTaps } from "../tapRhythm";

// ♩=120 → 1 tick = 0.5 / 12 秒、4分音符 = 0.5秒、8分 = 0.25秒
const spt = 0.5 / 12;
const opts8 = { secondsPerTick: spt, lengthTicks: 48, gridTicks: 6 };
const opts16 = { secondsPerTick: spt, lengthTicks: 48, gridTicks: 3 };
const summary = (r: ReturnType<typeof transcribeTaps>) =>
  r.events.map((e) => [e.startTick, e.durationTicks, e.kind, e.guitarAction]);

describe("タップからの採譜", () => {
  it("4分音符のタップ（多少ずれても）→ 4分ダウン×4", () => {
    const r = transcribeTaps([{ time: 0.01 }, { time: 0.48 }, { time: 1.03 }, { time: 1.52 }], opts8);
    expect(summary(r)).toEqual([
      [0, 12, "note", "downstroke"],
      [12, 12, "note", "downstroke"],
      [24, 12, "note", "downstroke"],
      [36, 12, "note", "downstroke"],
    ]);
    expect(r.deviationsMs).toEqual([10, -20, 30, 20]);
  });

  it("裏拍のタップは自動でアップ（↓ ↓↑ ・↑ ↓↑）", () => {
    const times = [0, 0.5, 0.75, 1.25, 1.5, 1.75];
    const r = transcribeTaps(
      times.map((time) => ({ time })),
      opts8,
    );
    expect(summary(r)).toEqual([
      [0, 12, "note", "downstroke"],
      [12, 6, "note", "downstroke"],
      [18, 12, "note", "upstroke"], // 3拍目の頭はタップなし＝伸ばす
      [30, 6, "note", "upstroke"],
      [36, 6, "note", "downstroke"],
      [42, 6, "note", "upstroke"],
    ]);
  });

  it("16ビート（16分の裏を叩いた）では 1 e & a = ↓ ↑ ↓ ↑", () => {
    expect([0, 3, 6, 9].map((t) => autoDirection(t, "16beat"))).toEqual([
      "downstroke",
      "upstroke",
      "downstroke",
      "upstroke",
    ]);
    const r = transcribeTaps([{ time: 0 }, { time: 0.125 }, { time: 0.25 }], opts16);
    expect(summary(r).map((e) => [e[0], e[3]])).toEqual([
      [0, "downstroke"],
      [3, "upstroke"],
      [6, "downstroke"],
    ]);
  });

  it("向きを指定したタップはその向き", () => {
    const r = transcribeTaps(
      [
        { time: 0, action: "upstroke" },
        { time: 0.25, action: "downstroke" },
      ],
      opts8,
    );
    expect(summary(r).map((e) => e[3])).toEqual(["upstroke", "downstroke"]);
  });

  it("最初のタップまでは休符、合計はパターンの長さ", () => {
    const r = transcribeTaps([{ time: 0.5 }, { time: 1.0 }], opts8);
    expect(summary(r)[0]).toEqual([0, 12, "rest", "none"]);
    expect(r.events.reduce((a, e) => a + e.durationTicks, 0)).toBe(48);
  });

  it("範囲外・同じマスへの重複タップは捨てる", () => {
    const r = transcribeTaps([{ time: -0.3 }, { time: 0 }, { time: 0.05 }, { time: 1.95 }, { time: 2.5 }], opts8);
    // 1.95秒は最も近いマスが 2.0秒（= 次の小節の頭）なので範囲外
    expect(r.events.filter((e) => e.kind === "note")).toHaveLength(1);
    expect(r.ignored).toBe(4);
  });

  it("少し早めのタップ（-0.1秒）は最初のマスに入る", () => {
    const r = transcribeTaps([{ time: -0.1 }], opts8);
    expect(summary(r)).toEqual([[0, 48, "note", "downstroke"]]);
  });

  it("タップなし → 全休符", () => {
    expect(summary(transcribeTaps([], opts8))).toEqual([[0, 48, "rest", "none"]]);
  });

  it("ずれの傾向の説明", () => {
    expect(describeTiming([5, -5, 10])).toBe("ほぼぴったり・安定しています");
    expect(describeTiming([60, 70, 50])).toBe("平均 60ms 遅れ気味・安定しています");
    expect(describeTiming([-40, -80, 0])).toContain("走り気味");
  });

  it("16分グリッドでも、8分だけを叩いたら 8ビート（& = ↑）", () => {
    const e = 0.25;
    const r = transcribeTaps(
      Array.from({ length: 8 }, (_, i) => ({ time: i * e })),
      opts16,
    );
    expect(r.events.map((x) => x.guitarAction)).toEqual(
      Array.from({ length: 8 }, (_, i) => (i % 2 ? "upstroke" : "downstroke")),
    );
    expect(detectFeel([0, 6, 12])).toBe("8beat");
    expect(detectFeel([0, 3, 6])).toBe("16beat");
  });

  it("タイミング補正の測定：遅れ 200ms・ゆらぎありでも中央値で求まる", () => {
    const beat = 0.625; // ♩=96
    const taps = [0.21, 0.625 + 0.18, 1.25 + 0.2, 1.875 + 0.23, 2.5 + 0.19, 3.125 + 0.21, 3.75 + 0.6 /* 外れ値 */];
    expect(estimateOffset(taps, beat)).toBeCloseTo(0.2, 2);
    expect(estimateOffset([-0.03, 0.6, 1.22], beat)).toBeCloseTo(-0.03, 3);
    expect(estimateOffset([0.1], beat)).toBeNull();
  });

  it("補正済みなら 200ms 遅れる環境でも 8分の ↓↑ が正しく入る", () => {
    const e = 0.25;
    const lat = 0.2;
    const raw = Array.from({ length: 8 }, (_, i) => i * e + lat);
    const offset = estimateOffset(
      [0, 0.5, 1, 1.5].map((t) => t + lat),
      0.5,
    )!;
    const r = transcribeTaps(
      raw.map((t) => ({ time: t - offset })),
      opts8,
    );
    expect(r.events.map((x) => [x.startTick, x.guitarAction])).toEqual(
      Array.from({ length: 8 }, (_, i) => [i * 6, i % 2 ? "upstroke" : "downstroke"]),
    );
  });
});
