import type { NotationValue } from "../music/timeline";

type Props = { value: NotationValue | null; rest: boolean; title?: string };

const NAMES: Record<NotationValue["base"], string> = {
  whole: "全",
  half: "2分",
  quarter: "4分",
  eighth: "8分",
  sixteenth: "16分",
};

export function notationLabel(value: NotationValue | null, rest: boolean): string {
  if (!value) return rest ? "休符" : "音符";
  return `${value.dotted ? "付点" : ""}${NAMES[value.base]}${rest ? "休符" : "音符"}`;
}

/** 音符・休符の簡易グリフ（SVG）。フォントに依存せず描画する。 */
export function NoteGlyph({ value, rest, title }: Props) {
  const label = title ?? notationLabel(value, rest);
  const base = value?.base ?? "quarter";
  const flags = base === "eighth" ? 1 : base === "sixteenth" ? 2 : 0;
  return (
    <svg className={`note-glyph${rest ? " rest" : ""}`} viewBox="0 0 22 34" role="img" aria-label={label}>
      <title>{label}</title>
      {rest ? <RestShape base={base} /> : <NoteShape base={base} flags={flags} />}
      {value?.dotted && <circle cx={rest ? 17 : 15} cy={rest ? 18 : 27} r={1.8} className="glyph-fill" />}
      {!value && (
        <text x={11} y={33} textAnchor="middle" className="glyph-q">
          ?
        </text>
      )}
    </svg>
  );
}

function NoteShape({ base, flags }: { base: NotationValue["base"]; flags: number }) {
  const hollow = base === "whole" || base === "half";
  return (
    <g>
      <ellipse
        cx={8}
        cy={27}
        rx={5}
        ry={3.6}
        transform="rotate(-20 8 27)"
        className={hollow ? "glyph-stroke" : "glyph-fill"}
        strokeWidth={hollow ? 1.8 : 0}
      />
      {base !== "whole" && <line x1={12.4} y1={26} x2={12.4} y2={4} className="glyph-stroke" strokeWidth={1.5} />}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M12.4 ${4 + i * 6} q 6 4 5 11`} className="glyph-stroke" strokeWidth={1.6} fill="none" />
      ))}
    </g>
  );
}

function RestShape({ base }: { base: NotationValue["base"] }) {
  switch (base) {
    case "whole":
      return <rect x={4} y={12} width={13} height={5} className="glyph-fill" />;
    case "half":
      return <rect x={4} y={15} width={13} height={5} className="glyph-fill" />;
    case "quarter":
      return <path d="M8 5 l5 6 l-4 5 l5 6 q-5 -2 -6 3 q-3 -5 3 -6 l-5 -5 l4 -5 z" className="glyph-fill" />;
    case "eighth":
      return (
        <g>
          <circle cx={8} cy={12} r={2.6} className="glyph-fill" />
          <path d="M8 14 q 4 1 7 -3 l -5 18" className="glyph-stroke" strokeWidth={1.6} fill="none" />
        </g>
      );
    case "sixteenth":
      return (
        <g>
          <circle cx={9} cy={9} r={2.3} className="glyph-fill" />
          <circle cx={7} cy={16} r={2.3} className="glyph-fill" />
          <path
            d="M9 11 q 4 1 7 -3 l -6 22 M7 18 q 4 1 7.5 -3"
            className="glyph-stroke"
            strokeWidth={1.5}
            fill="none"
          />
        </g>
      );
  }
}
