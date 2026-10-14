// コードをタップで選ぶ一覧（ルート12音 × 種類）。✎コード と 歌詞シート で共用。
export const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const QUALITIES: [suffix: string, label: string][] = [
  ["", "メジャー"],
  ["m", "m"],
  ["7", "7"],
  ["maj7", "maj7"],
  ["m7", "m7"],
  ["sus4", "sus4"],
  ["add9", "add9"],
  ["6", "6"],
  ["dim", "dim"],
  ["aug", "aug"],
  ["m7b5", "m7♭5"],
  ["dim7", "dim7"],
  ["aug7", "aug7"],
  ["9", "9"],
  ["m9", "m9"],
  ["maj9", "maj9"],
  ["7b9", "7♭9"],
  ["7#9", "7♯9"],
  ["13", "13"],
];

/** "F#m7/E" → { root: "F#", suffix: "m7", bass: "/E" } */
export function splitName(name: string) {
  const m = /^([A-G][#♯b♭]?)([^/]*)(\/.*)?$/.exec(name.trim());
  return m ? { root: m[1], suffix: m[2], bass: m[3] ?? "" } : { root: "C", suffix: "", bass: "" };
}

type Props = {
  /** 今のコード名（なければ未選択） */
  value?: string;
  onChange: (name: string) => void;
};

/**
 * ルートを押すとそのルートで（種類は今のまま）、種類を押すとそのルートで種類を変える。
 * まだコードがないときは、ルートを押すとメジャーコードになる（種類は先にルートを選んでから）。
 */
export function ChordPalette({ value, onChange }: Props) {
  const parts = value ? splitName(value) : null;
  return (
    <>
      <div className="ce-palette" role="group" aria-label="ルート">
        {ROOTS.map((r) => (
          <button
            key={r}
            type="button"
            className={`chip${parts?.root === r ? " on" : ""}`}
            aria-pressed={parts?.root === r}
            onClick={() => onChange(r + (parts ? parts.suffix + parts.bass : ""))}
          >
            {r.replace("#", "♯").replace("b", "♭")}
          </button>
        ))}
      </div>
      <div className="ce-palette" role="group" aria-label="種類">
        {QUALITIES.map(([suffix, text]) => (
          <button
            key={text}
            type="button"
            className={`chip${parts?.suffix === suffix ? " on" : ""}`}
            aria-pressed={parts?.suffix === suffix}
            disabled={!parts}
            title={parts ? "" : "先にルートを選んでください"}
            onClick={() => parts && onChange(parts.root + suffix + parts.bass)}
          >
            {text}
          </button>
        ))}
      </div>
    </>
  );
}
