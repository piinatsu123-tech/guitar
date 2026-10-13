import { describe, expect, it } from "vitest";
import { estimateFrequency, midiToFrequency, pluckWaveform } from "../synth";

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe("撥弦音の合成", () => {
  it("A4 = 440Hz、E2 = 82.4Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(40)).toBeCloseTo(82.407, 2);
  });

  // ギターの音域（6弦開放 E2 〜 1弦15フレット G5）で、合成音の実際の音高を測って確かめる
  it.each([40, 45, 48, 50, 55, 59, 60, 64, 67, 72, 76, 79])("MIDI %i の音高が ±5 セント以内", (midi) => {
    const sr = 44100;
    const wave = pluckWaveform(midi, sr, 0.3);
    const f = estimateFrequency(wave, sr);
    expect(Math.abs(cents(f, midiToFrequency(midi)))).toBeLessThan(5);
  });

  it("減衰する（0.1秒より1秒後のほうが小さい）", () => {
    const sr = 22050;
    const w = pluckWaveform(52, sr, 1.2);
    const rms = (from: number) => {
      let s = 0;
      for (let i = 0; i < 2000; i++) s += w[from + i] ** 2;
      return Math.sqrt(s / 2000);
    };
    expect(rms(Math.floor(sr * 1.0))).toBeLessThan(rms(Math.floor(sr * 0.1)) * 0.8);
    expect(Math.max(...w.slice(0, 5000).map(Math.abs))).toBeLessThanOrEqual(1);
  });
});
