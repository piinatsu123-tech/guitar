import type { FormAnalysis } from "../music/chord";
import { pitchClassName, type NoteLabelMode } from "../music/pitch";

/** フォームがコード名として成立しているかの表示 */
export function FormAnalysisView({ analysis, labelMode }: { analysis: FormAnalysis; labelMode: NoteLabelMode }) {
  const mode: NoteLabelMode = labelMode === "hidden" ? "abc" : labelMode;
  const name = (pc: number) => pitchClassName(pc, mode);
  const { chord } = analysis;
  if (!chord) return <p className="analysis bad">✗ コード名を解析できません</p>;
  const present = new Set(analysis.notes.map((n) => ((n.midi % 12) + 12) % 12));
  const problems: string[] = [];
  if (analysis.notes.length < 3) problems.push("鳴る弦が3本未満です");
  if (analysis.missingRequired.length) problems.push(`不足: ${analysis.missingRequired.map(name).join("・")}`);
  if (analysis.nonChordTones.length) problems.push(`構成音以外: ${analysis.nonChordTones.map(name).join("・")}`);
  if (!analysis.bassOk && analysis.bassPc !== null)
    problems.push(`最低音が ${name(analysis.bassPc)}（期待: ${name(chord.bass ?? chord.root)}）`);
  return (
    <div className={`analysis ${analysis.valid ? "ok" : "bad"}`}>
      <span className="analysis-status">
        {analysis.valid ? "✓" : "⚠"} {chord.name}（{chord.quality.label}）
      </span>
      <span className="analysis-tones">
        構成音:
        {chord.chordPcs.map((pc) => (
          <span key={pc} className={`tone${present.has(pc) ? " present" : " absent"}`}>
            {present.has(pc) ? "✓" : "–"}
            {name(pc)}
          </span>
        ))}
      </span>
      {problems.length > 0 && <span className="analysis-problems">{problems.join(" / ")}</span>}
      {analysis.missingOptional.length > 0 && analysis.valid && (
        <span className="muted small">（{analysis.missingOptional.map(name).join("・")} は省略）</span>
      )}
    </div>
  );
}
