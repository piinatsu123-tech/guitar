// タップ入力からリズムを採譜する（純粋関数）。
// クリックに合わせてタップした時刻を、グリッド（8分・16分）の最も近い位置に寄せて
// 音符・ストロークのイベント列にする。
import type { GuitarAction } from "../model/types";

export type Tap = {
  /** 録音開始（パターンの頭）からの秒数。出力遅延の補正は済ませておく */
  time: number;
  /** 指定がなければ位置から自動で決める */
  action?: GuitarAction;
};

export type TranscribedEvent = {
  startTick: number;
  durationTicks: number;
  kind: "note" | "rest";
  guitarAction: GuitarAction;
};

export type Transcription = {
  events: TranscribedEvent[];
  /** 採用した各タップのずれ（ミリ秒、正 = 遅れ） */
  deviationsMs: number[];
  /** 範囲外・重複で捨てたタップの数 */
  ignored: number;
};

/**
 * 自動のストローク方向：グリッドの偶数番目（表拍側）はダウン、奇数番目（裏拍側）はアップ。
 * 8分グリッドなら「拍の頭 ↓・&  ↑」、16分グリッドなら「1 ↓ e ↑ & ↓ a ↑」になり、
 * 腕を一定に振るストロークの基本と一致する。
 */
export function autoDirection(tick: number, gridTicks: number): GuitarAction {
  return Math.round(tick / gridTicks) % 2 === 0 ? "downstroke" : "upstroke";
}

export function transcribeTaps(
  taps: Tap[],
  opts: { secondsPerTick: number; lengthTicks: number; gridTicks: number },
): Transcription {
  const { secondsPerTick, lengthTicks, gridTicks } = opts;
  const onsets = new Map<number, GuitarAction>();
  const deviationsMs: number[] = [];
  let ignored = 0;
  for (const tap of [...taps].sort((a, b) => a.time - b.time)) {
    const exact = tap.time / secondsPerTick;
    const tick = Math.round(exact / gridTicks) * gridTicks;
    // パターンの外（最後のマスより後ろ）や、同じマスへの2回目のタップは使わない
    if (tick < 0 || tick >= lengthTicks || onsets.has(tick)) {
      ignored++;
      continue;
    }
    onsets.set(tick, tap.action ?? autoDirection(tick, gridTicks));
    deviationsMs.push(Math.round((exact - tick) * secondsPerTick * 1000));
  }

  const ticks = [...onsets.keys()].sort((a, b) => a - b);
  const events: TranscribedEvent[] = [];
  // 最初のタップまでは休符
  if (ticks.length === 0 || ticks[0] > 0) {
    events.push({ startTick: 0, durationTicks: ticks[0] ?? lengthTicks, kind: "rest", guitarAction: "none" });
  }
  // 各音は次のタップまで伸ばす（ストロークは鳴らしたまま次を弾く）
  ticks.forEach((t, i) => {
    const end = ticks[i + 1] ?? lengthTicks;
    events.push({ startTick: t, durationTicks: end - t, kind: "note", guitarAction: onsets.get(t)! });
  });
  return { events, deviationsMs, ignored };
}

/** ずれの傾向を言葉にする（練習のフィードバック用） */
export function describeTiming(deviationsMs: number[]): string {
  if (deviationsMs.length === 0) return "";
  const avg = deviationsMs.reduce((a, b) => a + b, 0) / deviationsMs.length;
  const spread = Math.sqrt(deviationsMs.reduce((a, b) => a + (b - avg) ** 2, 0) / deviationsMs.length);
  const tendency =
    Math.abs(avg) < 20
      ? "ほぼぴったり"
      : avg > 0
        ? `平均 ${Math.round(avg)}ms 遅れ気味`
        : `平均 ${Math.round(-avg)}ms 走り気味`;
  const steadiness = spread < 25 ? "安定しています" : spread < 50 ? "少しばらつきがあります" : "ばらつきが大きめです";
  return `${tendency}・${steadiness}`;
}
