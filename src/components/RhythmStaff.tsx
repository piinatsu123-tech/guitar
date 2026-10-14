import { splitIntoMeasures } from "../music/measureRhythm";
import { SIXTEENTH, subdivisionLabel, ticksPerBeat, ticksPerMeasure } from "../music/timeline";
import type { SectionRhythm, TimeSignature } from "../model/types";
import { ACTION_LABEL, ACTION_SYMBOL, Notes } from "./RhythmTimeline";

const pct = (tick: number, len: number) => `${(tick / len) * 100}%`;

/**
 * リズム譜（リズムだけ。コード・歌詞とは切り離して表示する）。
 * 小節ごとに音符・ストロークの向き・拍の目盛りを並べる。playingBar は再生中の小節（0始まり）。
 */
export function RhythmStaff({
  rhythm,
  timeSignature,
  playingBar,
}: {
  rhythm: SectionRhythm;
  timeSignature: TimeSignature;
  playingBar?: number | null;
}) {
  const m = ticksPerMeasure(timeSignature);
  const beat = ticksPerBeat(timeSignature);
  const bars = Math.max(1, Math.round(rhythm.lengthTicks / m));
  const measures = splitIntoMeasures(rhythm.events, m, bars);
  const grid: number[] = [];
  for (let t = 0; t < m; t += SIXTEENTH) grid.push(t);
  return (
    <div className="timeline tl-detail rhythm-staff">
      {measures.map((events, bi) => {
        const placed = events.map((e, i) => ({ ...e, id: `${bi}-${i}`, clippedStart: false, clippedEnd: false }));
        return (
          <div
            key={bi}
            className={`tl-measure${playingBar === bi ? " playing" : ""}`}
            role="group"
            aria-label={`リズム ${bi + 1}小節目`}
          >
            <span className="tl-measure-num" aria-hidden>
              {bi + 1}
            </span>
            <div className="tl-grid" aria-hidden>
              {grid.map((t) => (
                <span
                  key={t}
                  className={`tl-gridline${t % beat === 0 ? " beat" : t % (SIXTEENTH * 2) === 0 ? " half" : ""}`}
                  style={{ left: pct(t, m) }}
                />
              ))}
            </div>
            <div className="tl-row tl-notes">
              <Notes events={placed} len={m} />
            </div>
            <div className="tl-row tl-strokes">
              {placed
                .filter((e) => e.kind === "note")
                .map((e) => (
                  <span
                    key={e.id}
                    className={`tl-stroke a-${e.guitarAction}`}
                    style={{ left: pct(e.startTick, m) }}
                    title={ACTION_LABEL[e.guitarAction]}
                    aria-label={ACTION_LABEL[e.guitarAction]}
                  >
                    {ACTION_SYMBOL[e.guitarAction]}
                  </span>
                ))}
            </div>
            <div className="tl-row tl-ruler" aria-hidden>
              {grid.map((t) => {
                const l = subdivisionLabel(t, timeSignature);
                return (
                  <span key={t} className={`tl-tick${t % beat === 0 ? " beat" : ""}`} style={{ left: pct(t, m) }}>
                    {t % beat === 0 || l === "&" ? l : "·"}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
