import type { SoundingNote } from "../music/chord";
import { isBlackKey, noteName, noteNameWithOctave, octaveOf, pitchClass, type NoteLabelMode } from "../music/pitch";

type Props = {
  notes: SoundingNote[];
  labelMode: NoteLabelMode;
  rootPc?: number | null;
  /** 指定すると鍵盤をタップできる（フォームの編集用） */
  onKeyClick?: (midi: number) => void;
  /** 表示範囲を固定する（省略時は発音する音に合わせる） */
  range?: { low: number; high: number };
  /** タップできる鍵盤（ギターで鳴らせる音）。省略時はすべて */
  isPlayable?: (midi: number) => boolean;
};

const STRING_GLYPH = ["", "①", "②", "③", "④", "⑤", "⑥"];

/**
 * 表示する鍵盤の範囲（C 始まり〜B 終わり）。
 * 発音する音を含むオクターブだけを表示し（最低2オクターブ）、スマートフォンでも鍵盤が読める大きさにする。
 * 音がなければ C3〜B4。
 */
export function keyboardRange(notes: SoundingNote[]): { low: number; high: number } {
  if (notes.length === 0) return { low: 48, high: 71 };
  const min = Math.min(...notes.map((n) => n.midi));
  const max = Math.max(...notes.map((n) => n.midi));
  const low = min - pitchClass(min);
  let high = max - pitchClass(max) + 11;
  if (high - low < 23) high = low + 23;
  return { low, high };
}

export function PianoView({ notes, labelMode, rootPc = null, onKeyClick, range, isPlayable }: Props) {
  const { low, high } = range ?? keyboardRange(notes);
  // 同じ音高を複数の弦で鳴らしていても鍵盤は1つ。弦との対応は保持して表示する。
  const byMidi = new Map<number, SoundingNote[]>();
  for (const n of notes) byMidi.set(n.midi, [...(byMidi.get(n.midi) ?? []), n]);

  const whiteW = 20;
  const whiteH = 86;
  const blackW = 12;
  const blackH = 54;
  const keys: { midi: number; x: number; black: boolean }[] = [];
  let wx = 0;
  for (let m = low; m <= high; m++) {
    if (isBlackKey(m)) keys.push({ midi: m, x: wx - blackW / 2, black: true });
    else {
      keys.push({ midi: m, x: wx, black: false });
      wx += whiteW;
    }
  }
  const width = wx;
  const height = whiteH + 34;
  const whites = keys.filter((k) => !k.black);
  const blacks = keys.filter((k) => k.black);

  const description = notes.length
    ? notes.map((n) => `${n.stringNumber}弦 ${noteNameWithOctave(n.midi, "abc")}`).join("、")
    : "発音なし";

  const keyClass = (midi: number, black: boolean) => {
    const on = byMidi.has(midi);
    const root = on && rootPc !== null && pitchClass(midi) === rootPc;
    const off = onKeyClick && isPlayable && !isPlayable(midi);
    return `${black ? "key-black" : "key-white"}${on ? " on" : ""}${root ? " root" : ""}${onKeyClick && !off ? " clickable" : ""}${off ? " unplayable" : ""}`;
  };

  const marker = (k: { midi: number; x: number; black: boolean }) => {
    const sounding = byMidi.get(k.midi);
    if (!sounding) return null;
    const w = k.black ? blackW : whiteW;
    const cx = k.x + w / 2;
    const cy = k.black ? blackH - 10 : whiteH - 12;
    const root = rootPc !== null && pitchClass(k.midi) === rootPc;
    return (
      <g key={`m${k.midi}`} pointerEvents="none">
        <circle cx={cx} cy={cy} r={k.black ? 5 : 6.5} className={`key-marker${root ? " root" : ""}`} />
        {labelMode !== "hidden" && (
          <text
            x={cx}
            y={k.black ? blackH - 22 : whiteH - 24}
            textAnchor="middle"
            className={`key-label${k.black ? " on-black" : ""}`}
          >
            {noteName(k.midi, labelMode)}
          </text>
        )}
        <text x={cx} y={whiteH + 14} textAnchor="middle" className="key-strings">
          {sounding.map((n) => STRING_GLYPH[n.stringNumber]).join("")}
        </text>
      </g>
    );
  };

  const keyRect = (k: { midi: number; x: number; black: boolean }) => {
    const common = {
      key: k.midi,
      x: k.x,
      y: 0,
      width: k.black ? blackW : whiteW,
      height: k.black ? blackH : whiteH,
      rx: k.black ? 1.5 : 2,
      className: keyClass(k.midi, k.black),
    };
    if (!onKeyClick || (isPlayable && !isPlayable(k.midi))) return <rect {...common} />;
    const name = noteNameWithOctave(k.midi, "abc");
    return (
      <rect
        {...common}
        role="button"
        tabIndex={0}
        aria-label={`鍵盤 ${name}`}
        aria-pressed={byMidi.has(k.midi)}
        onClick={() => onKeyClick(k.midi)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onKeyClick(k.midi);
          }
        }}
      />
    );
  };

  return (
    <svg
      className={`piano-view${onKeyClick ? " editable" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role={onKeyClick ? "group" : "img"}
      aria-label={`ピアノ鍵盤: ${description}`}
      style={{ maxWidth: whites.length * 32 }}
    >
      {whites.map((k) => keyRect(k))}
      {blacks.map((k) => keyRect(k))}
      {/* オクターブの目印（C の位置） */}
      {labelMode !== "hidden" &&
        whites
          .filter((k) => pitchClass(k.midi) === 0)
          .map((k) => (
            <text key={`c${k.midi}`} x={k.x + whiteW / 2} y={whiteH + 28} textAnchor="middle" className="octave-label">
              {labelMode === "solfege" ? `ド${octaveOf(k.midi)}` : `C${octaveOf(k.midi)}`}
            </text>
          ))}
      {keys.map(marker)}
    </svg>
  );
}
