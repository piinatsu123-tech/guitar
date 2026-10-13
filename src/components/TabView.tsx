import { fretsFromPositions, type GuitarStringPosition } from "../music/chord";
import { midiAt, noteName, pitchClass, type NoteLabelMode, type StringNumber } from "../music/pitch";

type Props = {
  positions: GuitarStringPosition[];
  labelMode: NoteLabelMode;
  /** ルート音のピッチクラス（強調表示用） */
  rootPc?: number | null;
  /** 指定すると指板のセルがクリック可能になる（フォーム編集用） */
  onCellClick?: (stringNumber: StringNumber, fret: number) => void;
  onOpenColumnClick?: (stringNumber: StringNumber) => void;
  /** 表示するフレット数（既定 5） */
  fretCount?: number;
  /** 表示開始フレットを固定する（編集時のスクロール用） */
  startFret?: number;
  compact?: boolean;
};

// 弦は上から 1弦 → 6弦（TAB 譜の慣例）
const STRINGS: StringNumber[] = [1, 2, 3, 4, 5, 6];

/** 押弦位置から表示開始フレットを決める（低いフォームはナットから表示） */
export function displayStartFret(positions: GuitarStringPosition[], fretCount: number): number {
  const fretted = positions.map((p) => p.fret).filter((f): f is number => f !== null && f > 0);
  if (fretted.length === 0) return 1;
  const max = Math.max(...fretted);
  const min = Math.min(...fretted);
  if (max <= fretCount) return 1;
  return Math.max(1, Math.min(min, max - fretCount + 1));
}

export function TabView({
  positions,
  labelMode,
  rootPc = null,
  onCellClick,
  onOpenColumnClick,
  fretCount = 5,
  startFret,
  compact = false,
}: Props) {
  const start = startFret ?? displayStartFret(positions, fretCount);
  const frets = fretsFromPositions(positions); // 6弦→1弦
  const fretOf = (s: StringNumber) => frets[6 - s];

  // ---- 寸法（viewBox 単位。実寸は CSS で幅に合わせて拡縮） ----
  const tabW = compact ? 0 : 64; // 左の TAB 譜
  const gap = compact ? 0 : 18;
  const openW = 34; // 開放・ミュート欄
  const cellW = 52;
  const rowH = compact ? 24 : 26;
  const top = 14;
  const boardX = tabW + gap + openW;
  const width = boardX + cellW * fretCount + 8;
  const height = top + rowH * 5 + 30;
  const y = (s: StringNumber) => top + (s - 1) * rowH;
  const r = 11;

  const label = (s: StringNumber, fret: number) => noteName(midiAt(s, fret)!, labelMode);
  const isRoot = (s: StringNumber, fret: number) => rootPc !== null && pitchClass(midiAt(s, fret)!) === rootPc;

  const description = STRINGS.map((s) => {
    const f = fretOf(s);
    if (f === null) return `${s}弦ミュート`;
    return `${s}弦${f === 0 ? "開放" : `${f}フレット`} ${noteName(midiAt(s, f)!, "abc")}`;
  }).join("、");

  return (
    <svg
      className="tab-view"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`TAB譜: ${description}`}
      style={{ maxWidth: compact ? 260 : 560 }}
    >
      {/* ---- TAB 譜（数字） ---- */}
      {!compact && (
        <g className="tab-numbers">
          {STRINGS.map((s) => (
            <line key={s} x1={0} x2={tabW} y1={y(s)} y2={y(s)} className="tab-line" />
          ))}
          <line x1={0} x2={0} y1={y(1)} y2={y(6)} className="tab-line" />
          <line x1={tabW} x2={tabW} y1={y(1)} y2={y(6)} className="tab-line" />
          <text x={10} y={y(2) + 4} className="tab-clef">
            T
          </text>
          <text x={10} y={y(3) + 10} className="tab-clef">
            A
          </text>
          <text x={10} y={y(5) + 4} className="tab-clef">
            B
          </text>
          {STRINGS.map((s) => {
            const f = fretOf(s);
            return (
              <g key={s}>
                <rect x={36} y={y(s) - 9} width={22} height={18} className="tab-num-bg" />
                <text x={47} y={y(s) + 5} textAnchor="middle" className="tab-num">
                  {f === null ? "×" : f}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ---- 指板 ---- */}
      <g className="fretboard">
        {/* 弦番号 */}
        {!compact &&
          STRINGS.map((s) => (
            <text key={s} x={boardX - openW - 6} y={y(s) + 4} textAnchor="end" className="string-num" aria-hidden>
              {s}
            </text>
          ))}
        {/* フレット線 */}
        {Array.from({ length: fretCount + 1 }, (_, i) => (
          <line
            key={i}
            x1={boardX + i * cellW}
            x2={boardX + i * cellW}
            y1={y(1)}
            y2={y(6)}
            className={i === 0 && start === 1 ? "nut" : "fret-line"}
          />
        ))}
        {/* 弦 */}
        {STRINGS.map((s) => (
          <line
            key={s}
            x1={boardX}
            x2={boardX + cellW * fretCount}
            y1={y(s)}
            y2={y(s)}
            className="string-line"
            strokeWidth={0.8 + (s - 1) * 0.35}
          />
        ))}
        {/* ポジションマーク */}
        {Array.from({ length: fretCount }, (_, i) => start + i)
          .filter((f) => [3, 5, 7, 9, 15, 17].includes(f))
          .map((f) => (
            <circle key={f} cx={boardX + (f - start + 0.5) * cellW} cy={(y(3) + y(4)) / 2} r={4} className="inlay" />
          ))}
        {Array.from({ length: fretCount }, (_, i) => start + i)
          .filter((f) => f === 12)
          .map((f) => (
            <g key={f}>
              <circle cx={boardX + (f - start + 0.5) * cellW} cy={(y(2) + y(3)) / 2} r={4} className="inlay" />
              <circle cx={boardX + (f - start + 0.5) * cellW} cy={(y(4) + y(5)) / 2} r={4} className="inlay" />
            </g>
          ))}
        {/* フレット番号 */}
        {Array.from({ length: fretCount }, (_, i) => start + i).map((f) => (
          <text key={f} x={boardX + (f - start + 0.5) * cellW} y={y(6) + 22} textAnchor="middle" className="fret-num">
            {f}
          </text>
        ))}

        {/* クリック領域（編集時） */}
        {onCellClick &&
          STRINGS.flatMap((s) =>
            Array.from({ length: fretCount }, (_, i) => start + i).map((f) => (
              <rect
                key={`${s}-${f}`}
                x={boardX + (f - start) * cellW}
                y={y(s) - rowH / 2}
                width={cellW}
                height={rowH}
                className="cell-hit"
                onClick={() => onCellClick(s, f)}
                role="button"
                aria-label={`${s}弦 ${f}フレット`}
              />
            )),
          )}
        {onOpenColumnClick &&
          STRINGS.map((s) => (
            <rect
              key={s}
              x={boardX - openW}
              y={y(s) - rowH / 2}
              width={openW}
              height={rowH}
              className="cell-hit"
              onClick={() => onOpenColumnClick(s)}
              role="button"
              aria-label={`${s}弦 開放／ミュート切替`}
            />
          ))}

        {/* 発音位置 */}
        {STRINGS.map((s) => {
          const f = fretOf(s);
          const cx0 = boardX - openW / 2;
          if (f === null) {
            return (
              <text key={s} x={cx0} y={y(s) + 5} textAnchor="middle" className="mute-mark" pointerEvents="none">
                ×
              </text>
            );
          }
          const root = isRoot(s, f);
          if (f === 0) {
            return (
              <g key={s} pointerEvents="none">
                <circle cx={cx0} cy={y(s)} r={r} className={`open-dot${root ? " root" : ""}`} />
                <text x={cx0} y={y(s) + 4} textAnchor="middle" className="dot-label open">
                  {label(s, 0)}
                </text>
              </g>
            );
          }
          if (f < start || f >= start + fretCount) {
            return (
              <text
                key={s}
                x={boardX + cellW * fretCount + 4}
                y={y(s) + 4}
                className="out-of-view"
                pointerEvents="none"
              >
                {f < start ? `←${f}F` : `${f}F→`}
              </text>
            );
          }
          const cx = boardX + (f - start + 0.5) * cellW;
          return (
            <g key={s} pointerEvents="none">
              <circle cx={cx} cy={y(s)} r={r} className={`fret-dot${root ? " root" : ""}`} />
              <text x={cx} y={y(s) + 4} textAnchor="middle" className="dot-label">
                {label(s, f)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
