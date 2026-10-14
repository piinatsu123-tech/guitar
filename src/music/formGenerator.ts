// コードフォームの自動生成。
// 1) コード名を解析 2) 範囲内の各弦の候補を列挙 3) 組み合わせを生成
// 4) コードとして成立するか検証 5) 押さえにくい候補を除外 6) スコア順に並べる
import { analyzeForm, parseChord, positionsFromFrets, type GuitarStringPosition } from "./chord";
import { midiAt, pitchClass, type StringNumber } from "./pitch";

export type GenerateOptions = {
  minFret: number;
  maxFret: number;
  allowOpen: boolean;
  maxResults: number;
};

export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = {
  minFret: 0,
  maxFret: 12,
  allowOpen: true,
  maxResults: 6,
};

export type GeneratedForm = {
  frets: (number | null)[]; // 6弦→1弦
  positions: GuitarStringPosition[];
  score: number;
  /** 必要な指の本数（セーハは1本と数える） */
  fingers: number;
  barre: number | null;
  baseFret: number;
};

/** 押弦するフレットの最大幅（最低フレット〜最高フレットの差） */
const MAX_SPAN = 3;
const MIN_SOUNDING = 4;
const STRINGS_LOW_TO_HIGH: StringNumber[] = [6, 5, 4, 3, 2, 1];

/** 押弦に必要な指の本数と、セーハの有無を推定する（高度な運指推定はしない） */
export function estimateFingering(frets: (number | null)[]): { fingers: number; barre: number | null } {
  const fretted = frets.map((f, i) => ({ f, i })).filter((x) => x.f !== null && x.f > 0) as { f: number; i: number }[];
  if (fretted.length === 0) return { fingers: 0, barre: null };
  const minF = Math.min(...fretted.map((x) => x.f));
  const atMin = fretted.filter((x) => x.f === minF);
  const others = fretted.length - atMin.length;
  if (atMin.length >= 2) {
    // セーハ：最低フレットを押さえる弦の範囲内に、開放弦・ミュート弦がないこと
    const from = Math.min(...atMin.map((x) => x.i));
    const to = Math.max(...atMin.map((x) => x.i));
    const barrePossible = frets.slice(from, to + 1).every((f) => f !== null && f >= minF);
    if (barrePossible) return { fingers: 1 + others, barre: minF };
  }
  return { fingers: fretted.length, barre: null };
}

function scoreCandidate(
  frets: (number | null)[],
  chordRoot: number,
  missingOptional: number,
  fingers: number,
  barre: number | null,
  power = false,
): number {
  let score = 0;
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const opens = frets.filter((f) => f === 0).length;
  const mutes = frets.filter((f) => f === null).length;
  const sounding = 6 - mutes;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;

  // 低いフレット位置を優先
  score += minF * 0.9;
  // 押弦の幅と指の本数
  score += (maxF - minF) * 0.6;
  score += fingers * 0.6;
  if (barre !== null) score += 0.8;
  // 開放弦を使う自然なフォームを優先
  score -= opens * 0.4;
  // 鳴る弦が多いほどストロークしやすい
  if (!power) score -= sounding * 0.5;
  // 弦の途中のミュートは難しい
  const firstSounding = frets.findIndex((f) => f !== null);
  const interiorMutes = frets.slice(firstSounding).filter((f) => f === null).length;
  if (power) {
    // パワーコード：隣り合う2〜3本（ルート・5度・オクターブ上のルート）で、ルートを6弦か5弦に置く形が定番
    score += Math.abs(sounding - 3) * 1.2 + firstSounding * 1.5;
  } else {
    score += interiorMutes * 3.5 + mutes * 0.3;
  }
  // 高いフレットを押さえながら、その間の弦を開放で鳴らすフォームは手が広がりにくい
  if (maxF >= 4) {
    const lastSounding = frets.length - 1 - [...frets].reverse().findIndex((f) => f !== null && f > 0);
    const firstFretted = frets.findIndex((f) => f !== null && f > 0);
    const interiorOpens = frets.slice(firstFretted, lastSounding + 1).filter((f) => f === 0).length;
    score += interiorOpens * 1.5;
  }
  // 省略音（主に5度）がある
  score += missingOptional * 1.5;
  // 同じ音高の過剰な重複
  const midis = frets
    .map((f, i) => (f === null ? null : midiAt(STRINGS_LOW_TO_HIGH[i], f)))
    .filter((m): m is number => m !== null);
  score += (midis.length - new Set(midis).size) * 0.8;
  // ルートが最高音にもあるとまとまりが良い（わずかに優遇）
  if (midis.length && pitchClass(midis[midis.length - 1]) === chordRoot) score -= 0.2;
  return score;
}

/** コード名と条件から、候補フォームを優先度順に返す */
export function generateForms(chordName: string, options: Partial<GenerateOptions> = {}): GeneratedForm[] {
  const opts = { ...DEFAULT_GENERATE_OPTIONS, ...options };
  const chord = parseChord(chordName);
  if (!chord) return [];
  const power = chord.chordPcs.length <= 2;
  const minFret = Math.max(0, Math.floor(opts.minFret));
  const maxFret = Math.max(minFret, Math.floor(opts.maxFret));

  const seen = new Set<string>();
  const results: GeneratedForm[] = [];

  // 押弦位置の窓（MAX_SPAN 幅）をずらしながら列挙する
  const firstWindow = Math.max(1, minFret);
  for (let windowStart = firstWindow; windowStart <= Math.max(firstWindow, maxFret); windowStart++) {
    const windowEnd = Math.min(maxFret, windowStart + MAX_SPAN);
    const options: (number | null)[][] = STRINGS_LOW_TO_HIGH.map((s) => {
      const o: (number | null)[] = [null];
      if (opts.allowOpen && minFret === 0 && chord.chordPcs.includes(pitchClass(midiAt(s, 0)!))) o.push(0);
      for (let f = windowStart; f <= windowEnd; f++) {
        if (chord.chordPcs.includes(pitchClass(midiAt(s, f)!))) o.push(f);
      }
      return o;
    });

    const current: (number | null)[] = [];
    const recurse = (idx: number) => {
      if (idx === 6) {
        evaluate([...current]);
        return;
      }
      for (const f of options[idx]) {
        current.push(f);
        recurse(idx + 1);
        current.pop();
      }
    };
    recurse(0);
  }

  function evaluate(frets: (number | null)[]) {
    const key = frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    const sounding = frets.filter((f) => f !== null).length;
    if (sounding < (power ? 2 : MIN_SOUNDING)) return;
    const firstSounding = frets.findIndex((f) => f !== null);
    if (power) {
      // パワーコード：鳴らす弦が隣り合ってひとまとまり（低音側・高音側のミュートは何本でもよい）
      const lastSounding = 5 - [...frets].reverse().findIndex((f) => f !== null);
      if (frets.slice(firstSounding, lastSounding + 1).some((f) => f === null)) return;
    } else {
      // ミュートは低音側に寄せ、それ以外（途中・1弦側）のミュートは1本まで
      const interior = frets.slice(firstSounding).filter((f) => f === null).length;
      if (interior > 1) return;
    }
    const fretted = frets.filter((f): f is number => f !== null && f > 0);
    if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > MAX_SPAN) return;
    const positions = positionsFromFrets(frets);
    const analysis = analyzeForm(chordName, positions);
    if (!analysis.valid) return;
    const { fingers, barre } = estimateFingering(frets);
    if (fingers > 4) return;
    const score = scoreCandidate(frets, chord!.root, analysis.missingOptional.length, fingers, barre, power);
    results.push({
      frets,
      positions,
      score,
      fingers,
      barre,
      baseFret: fretted.length ? Math.min(...fretted) : 0,
    });
  }

  results.sort((a, b) => a.score - b.score || a.baseFret - b.baseFret);

  // バリエーションの確保：同じ押弦位置の候補は2つまで、
  // 既に選んだ候補にミュートを足しただけの候補は除外する
  const picked: GeneratedForm[] = [];
  const perBase = new Map<number, number>();
  for (const r of results) {
    if (picked.length >= opts.maxResults) break;
    const count = perBase.get(r.baseFret) ?? 0;
    if (count >= 2) continue;
    const isSubset = picked.some((p) => p.frets.every((f, i) => r.frets[i] === f || r.frets[i] === null));
    if (isSubset) continue;
    picked.push(r);
    perBase.set(r.baseFret, count + 1);
  }
  return picked;
}
