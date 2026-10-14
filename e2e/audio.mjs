// 音声の検証：スケジュールを実ブラウザ（Chromium）でオフライン描画し、出てきた音そのものを測る。
// 使い方: npm run e2e:audio
import { chromium } from "playwright";
import { createServer } from "vite";
import assert from "node:assert/strict";

const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);

const result = await page.evaluate(async () => {
  const { makeChord, makePattern, makeSection } = await import("/src/model/factory.ts");
  const { buildSongSchedule } = await import("/src/audio/schedule.ts");
  const { renderOffline } = await import("/src/audio/player.ts");
  const { estimateFrequency } = await import("/src/audio/synth.ts");
  const p = makePattern("p", 48, [
    [0, 12, "note", "downstroke"],
    [12, 6, "note", "downstroke"],
    [18, 6, "note", "upstroke"],
    [24, 6, "note", "none"],
    [30, 6, "note", "upstroke"],
    [36, 6, "note", "mute"],
    [42, 6, "rest", "none"],
  ]);
  const pluck = makePattern("pluck", 48, [[0, 48, "note", "pluck"]]);
  const a = makeSection("A", [makeChord("C", 48), makeChord("Am", 48)]);
  a.chords[1].rhythmPatternId = pluck.id;
  const song = {
    id: "s",
    title: "t",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [a],
    forms: [],
    rhythmPatterns: [p, pluck],
    defaultRhythmPatternId: p.id,
    createdAt: "",
    updatedAt: "",
  };
  const sr = 22050;
  const schedule = buildSongSchedule(song, 0);
  const data = await renderOffline(schedule, sr);
  // 10ms 窓の RMS（音量）と、1次差分の RMS（高域＝はじいた瞬間の明るい成分）
  const win = Math.floor(sr * 0.01);
  const rms = [];
  const hf = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0;
    let h = 0;
    for (let j = 0; j < win; j++) {
      s += data[i + j] ** 2;
      h += (data[i + j] - (data[i + j - 1] ?? 0)) ** 2;
    }
    rms.push(Math.sqrt(s / win));
    hf.push(Math.sqrt(h / win));
  }
  // 立ち上がり：高域が 30〜50ms 前の最大の 2倍以上に跳ねた位置
  // （ストロークは弦を順に鳴らすので立ち上がりが 30ms 近くに広がる）
  const onsets = [];
  for (let i = 0; i < hf.length; i++) {
    const before = Math.max(hf[i - 3] ?? 0, hf[i - 4] ?? 0, hf[i - 5] ?? 0);
    if (hf[i] > 0.01 && hf[i] > before * 2 && (onsets.length === 0 || i * 0.01 - onsets[onsets.length - 1] > 0.08)) {
      onsets.push(+(i * 0.01).toFixed(2));
    }
  }
  const level = (t0, t1) => Math.max(...rms.slice(Math.round(t0 / 0.01), Math.round(t1 / 0.01)));
  // 2小節目: Am の最低音（5弦開放 A2 = 110Hz）だけをピッキング
  const seg = data.slice(Math.floor(sr * 2.0), Math.floor(sr * 2.6));
  return {
    onsets,
    expected: schedule.events.filter((e) => e.kind !== "damp").map((e) => +e.time.toFixed(2)),
    atNone: level(1.0, 1.2),
    beforeNone: level(0.8, 0.95),
    afterRest: level(1.85, 1.98),
    pluckHz: estimateFrequency(seg, sr),
    peak: Math.max(...data.map(Math.abs)),
  };
});
// タップの手応え音：短く（40ms 以内に消える）、音程が一定で、クリックより低い
const tap = await page.evaluate(async () => {
  const { renderOffline } = await import("/src/audio/player.ts");
  const sr = 22050;
  const data = await renderOffline(
    {
      events: [
        { kind: "tap", time: 0.1 },
        { kind: "tap", time: 0.3 },
        { kind: "click", time: 0.5, accent: false },
      ],
      chordStarts: [],
      duration: 0.7,
    },
    sr,
    0,
  );
  const seg = (a, b) => data.slice(Math.floor(a * sr), Math.floor(b * sr));
  const peak = (x) => Math.max(...x.map(Math.abs));
  // 区間内のゼロ交差の数 ÷ 2 ÷ 長さ ≒ 周波数
  const hz = (x, secs) => {
    let n = 0;
    for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) n++;
    return n / 2 / secs;
  };
  return {
    tapPeak: peak(seg(0.1, 0.13)),
    afterTap: peak(seg(0.14, 0.29)),
    tapHz1: hz(seg(0.1, 0.125), 0.025),
    tapHz2: hz(seg(0.3, 0.325), 0.025),
    clickHz: hz(seg(0.5, 0.525), 0.025),
  };
});
console.log(JSON.stringify(tap));
assert.ok(tap.tapPeak > 0.05, "タップ音が鳴る");
assert.ok(tap.afterTap < 0.001, "タップ音は 40ms 以内に消える（クリックを邪魔しない）");
assert.ok(Math.abs(tap.tapHz1 - 440) < 60 && Math.abs(tap.tapHz2 - 440) < 60, "タップ音は 440Hz で一定");
assert.ok(tap.clickHz > tap.tapHz1 * 1.8, "クリックとは高さが違って聞き分けられる");

// リズム譜の打撃音：書いた時刻に鳴り、すぐ消える。ダウンはアップより強い
const hits = await page.evaluate(async () => {
  const { renderOffline } = await import("/src/audio/player.ts");
  const sr = 22050;
  const data = await renderOffline(
    {
      events: [
        { kind: "hit", time: 0.1, stroke: "down" },
        { kind: "hit", time: 0.5, stroke: "up" },
        { kind: "hit", time: 0.9, stroke: "mute" },
      ],
      chordStarts: [],
      duration: 1.3,
    },
    sr,
    0,
  );
  const peak = (a, b) => Math.max(...data.slice(Math.floor(a * sr), Math.floor(b * sr)).map(Math.abs));
  return {
    before: peak(0, 0.095),
    down: peak(0.1, 0.15),
    downTail: peak(0.4, 0.49),
    up: peak(0.5, 0.55),
    mute: peak(0.9, 0.95),
    muteTail: peak(0.98, 1.2),
  };
});
console.log(JSON.stringify(hits));
assert.ok(hits.before < 0.001, "打つ前は無音");
assert.ok(hits.down > 0.05 && hits.up > 0.03 && hits.mute > 0.03, "それぞれの時刻で鳴る");
assert.ok(hits.down > hits.up, "ダウンはアップより強い");
assert.ok(hits.downTail < 0.01 && hits.muteTail < 0.005, "次の音までに消える（ブラッシングは特に短い）");

await browser.close();
await server.close();

console.log(JSON.stringify(result));
const near = (a, b) => Math.abs(a - b) <= 0.02;
assert.deepEqual(result.expected, [0, 0.5, 0.75, 1.25, 1.5, 2]);
assert.equal(result.onsets.length, result.expected.length, `onsets ${result.onsets} vs ${result.expected}`);
result.onsets.forEach((t, i) => assert.ok(near(t, result.expected[i]), `onset ${t} vs ${result.expected[i]}`));
assert.ok(result.atNone > 0.01, "「弾かない」の位置でも前の音が鳴り続けている");
assert.ok(result.atNone < result.beforeNone, "「弾かない」の位置で新しい音は出ない（減衰中）");
assert.ok(result.afterRest < 0.005, `休符で音が止まる (${result.afterRest})`);
assert.ok(Math.abs(1200 * Math.log2(result.pluckHz / 110)) < 10, `ピッキングは A2=110Hz (${result.pluckHz})`);
assert.ok(result.peak <= 1, "クリップしない");
console.log("audio checks passed");
