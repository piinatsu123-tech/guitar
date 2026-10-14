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

export type StrumFeel = "8beat" | "16beat";

/**
 * 自動のストローク方向。腕は一定の周期で上下し、その下りの位置で弾けばダウン、上りならアップ。
 *   8ビート : 拍の頭 ↓・& ↑（腕の1往復 = 4分音符）
 *   16ビート: 1 ↓・e ↑・& ↓・a ↑（腕の1往復 = 8分音符）
 * 4分音符 = 12 tick なので、往復の長さは 8ビートで 12、16ビートで 6 tick。
 */
export function autoDirection(tick: number, feel: StrumFeel): GuitarAction {
  const cycle = feel === "8beat" ? 12 : 6;
  return tick % cycle === 0 ? "downstroke" : "upstroke";
}

/**
 * 弾いたリズムから 8ビート／16ビートを判断する。16分の裏（e・a）にタップがあれば 16ビート。
 * グリッドの設定ではなく実際のタップで決めるので、16分グリッドで8分を叩いても ↓↑ になる。
 */
export function detectFeel(ticks: number[]): StrumFeel {
  return ticks.some((t) => t % 6 !== 0) ? "16beat" : "8beat";
}

export function transcribeTaps(
  taps: Tap[],
  opts: { secondsPerTick: number; lengthTicks: number; gridTicks: number },
): Transcription {
  const { secondsPerTick, lengthTicks, gridTicks } = opts;
  const onsets = new Map<number, GuitarAction | undefined>();
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
    onsets.set(tick, tap.action);
    deviationsMs.push(Math.round((exact - tick) * secondsPerTick * 1000));
  }
  const feel = detectFeel([...onsets.keys()]);
  for (const [tick, action] of onsets) onsets.set(tick, action ?? autoDirection(tick, feel));

  const ticks = [...onsets.keys()].sort((a, b) => a - b);
  const events: TranscribedEvent[] = [];
  // 最初のタップまでは休符
  if (ticks.length === 0 || ticks[0] > 0) {
    events.push({ startTick: 0, durationTicks: ticks[0] ?? lengthTicks, kind: "rest", guitarAction: "none" });
  }
  // 各音は次のタップまで伸ばす（ストロークは鳴らしたまま次を弾く）
  ticks.forEach((t, i) => {
    const end = ticks[i + 1] ?? lengthTicks;
    events.push({ startTick: t, durationTicks: end - t, kind: "note", guitarAction: onsets.get(t) ?? "downstroke" });
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

/**
 * タイミング補正の測定：4分音符のクリックに合わせたタップから、いつも何秒ずれているか（中央値）を求める。
 * 拍の間隔の半分（♩=96 なら 312ms）までのずれを測れるので、Bluetooth イヤホンなどの大きな遅れにも使える。
 * 正 = タップが遅れて記録される（音が遅れて聞こえている）。
 */
export function estimateOffset(tapTimes: number[], beatSeconds: number): number | null {
  const residuals = tapTimes
    .filter((t) => t > -beatSeconds / 2)
    .map((t) => t - Math.round(t / beatSeconds) * beatSeconds)
    .sort((a, b) => a - b);
  if (residuals.length < 3) return null;
  const mid = Math.floor(residuals.length / 2);
  return residuals.length % 2 ? residuals[mid] : (residuals[mid - 1] + residuals[mid]) / 2;
}
