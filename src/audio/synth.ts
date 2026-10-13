// 撥弦音の合成（Karplus-Strong 法）。純粋関数なので音高をテストで確かめられる。

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 1本の弦をはじいた音の波形を作る。
 * 周期 N = sampleRate / f のディレイ線を、隣接サンプルの平均（ローパス）で減衰させながら回す。
 * N を整数に丸めると高音で音程がずれるため、小数部分は1次オールパス補間で合わせる。
 */
export function pluckWaveform(midi: number, sampleRate: number, seconds: number, seed = midi): Float32Array {
  const freq = midiToFrequency(midi);
  // ディレイ線の現在値と「次の」値を平均するとループが 0.5 サンプル短くなるので、その分を足す
  const period = sampleRate / freq + 0.5;
  const n = Math.floor(period);
  const frac = period - n;
  const c = (1 - frac) / (1 + frac); // オールパス係数
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  const line = new Float32Array(n);
  // 決定的な疑似乱数（同じ音は毎回同じ波形）
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < n; i++) line[i] = rand() * 2 - 1;
  // 低音ほど長く響き、高音ほど早く減衰する
  const decay = 0.996 + Math.min(0.0035, 20 / freq) * 0.9;
  let idx = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = line[idx];
    const next = line[(idx + 1) % n];
    const avg = 0.5 * (cur + next) * decay;
    // オールパス補間で小数遅延を付ける
    const y = c * avg + apX - c * apY;
    apX = avg;
    apY = y;
    line[idx] = y;
    out[i] = cur;
    idx = (idx + 1) % n;
  }
  // 立ち上がりのクリックを防ぐ短いフェードイン
  const fade = Math.min(out.length, Math.floor(sampleRate * 0.002));
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  return out;
}

/**
 * 波形の基本周波数を推定する（テスト・検証用）。
 * 正規化自己相関が最初に負へ落ちた後、最初に現れる強い山（> 0.8）のラグを周期とみなす。
 */
export function estimateFrequency(data: Float32Array, sampleRate: number, minHz = 50, maxHz = 1500): number {
  const start = Math.floor(sampleRate * 0.05); // 立ち上がりのノイズを避ける
  const len = Math.min(data.length - start - Math.ceil(sampleRate / minHz), Math.floor(sampleRate * 0.1));
  const r = (lag: number) => {
    let xy = 0;
    let xx = 0;
    let yy = 0;
    for (let i = 0; i < len; i++) {
      const x = data[start + i];
      const y = data[start + i + lag];
      xy += x * y;
      xx += x * x;
      yy += y * y;
    }
    return xy / Math.sqrt(xx * yy || 1);
  };
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  let lag = minLag;
  while (lag < maxLag && r(lag) > 0) lag++;
  for (; lag < maxLag; lag++) {
    const v = r(lag);
    if (v > 0.8 && v >= r(lag - 1) && v >= r(lag + 1)) {
      const a = r(lag - 1);
      const d = r(lag + 1);
      const shift = (a - d) / (2 * (a - 2 * v + d));
      return sampleRate / (lag + (Number.isFinite(shift) ? shift : 0));
    }
  }
  return NaN;
}
