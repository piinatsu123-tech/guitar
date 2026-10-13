import { isValidTimeSignature, ticksPerMeasure } from "../../music/timeline";
import type { Song } from "../../model/types";

export function BasicTab({ song, onChange }: { song: Song; onChange: (s: Song) => void }) {
  const setTs = (numerator: number, denominator: number) => {
    const ts = { numerator, denominator };
    if (isValidTimeSignature(ts)) onChange({ ...song, timeSignature: ts });
  };
  const measureTicks = ticksPerMeasure(song.timeSignature);
  const offBar = song.sections.filter((s) => s.chords.reduce((a, c) => a + c.durationTicks, 0) % measureTicks !== 0);
  return (
    <div className="card form-grid">
      <label className="field">
        <span>曲名</span>
        <input type="text" value={song.title} onChange={(e) => onChange({ ...song, title: e.target.value })} />
      </label>
      <label className="field">
        <span>テンポ（BPM）</span>
        <input
          type="number"
          min={20}
          max={400}
          value={song.tempo}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange({ ...song, tempo: Math.min(400, Math.max(20, Math.round(v))) });
          }}
        />
      </label>
      <div className="field">
        <span>拍子</span>
        <div className="inline">
          <input
            type="number"
            aria-label="拍子の分子"
            min={1}
            max={16}
            value={song.timeSignature.numerator}
            onChange={(e) => setTs(Number(e.target.value), song.timeSignature.denominator)}
            className="narrow"
          />
          <span>/</span>
          <select
            aria-label="拍子の分母"
            value={song.timeSignature.denominator}
            onChange={(e) => setTs(song.timeSignature.numerator, Number(e.target.value))}
          >
            {[2, 4, 8, 16].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small">
          拍子を変えてもコードの長さ（音楽上の時間）は変わりません。小節の区切りが変わるので、必要に応じてコードの長さやリズムパターンを調整してください。
        </p>
        {offBar.length > 0 && (
          <p className="warn small">⚠ 小節の途中で終わるセクション: {offBar.map((s) => s.name).join("、")}</p>
        )}
      </div>
    </div>
  );
}
