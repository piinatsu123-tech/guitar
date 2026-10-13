import { Fragment } from "react";
import type { MeasureRow } from "../music/arrangement";
import { groupLyricsByTick } from "../music/lyrics";
import {
  notationForDuration,
  SIXTEENTH,
  splitIntoNotatable,
  subdivisionLabel,
  ticksPerBeat,
  type PlacedRhythmEvent,
} from "../music/timeline";
import type { GuitarAction, TimeSignature } from "../model/types";
import { NoteGlyph } from "./NoteGlyph";

export const ACTION_SYMBOL: Record<GuitarAction, string> = {
  downstroke: "↓",
  upstroke: "↑",
  pluck: "●",
  mute: "×",
  none: "—",
};

export const ACTION_LABEL: Record<GuitarAction, string> = {
  downstroke: "ダウンストローク",
  upstroke: "アップストローク",
  pluck: "ピッキング（単音・アルペジオ）",
  mute: "ブラッシング（ミュート）",
  none: "弾かずに伸ばす",
};

type Props = {
  rows: MeasureRow[];
  timeSignature: TimeSignature;
  selectedChordId?: string;
  onSelectChord?: (chordId: string) => void;
  onToggleAccent?: (chordId: string, lyricId: string) => void;
  showRhythm: boolean;
  showLyrics: boolean;
  /** 小節番号の表示に使う（セクション内の通し番号の開始値） */
  measureNumberOffset?: number;
};

const pct = (tick: number, len: number) => `${(tick / len) * 100}%`;

/**
 * 小節単位のタイムライン。コード名・音符・ストローク・拍目盛り・歌詞を共通の tick 軸に並べる。
 * 位置はすべて「小節内 tick ÷ 小節長」の割合なので、画面幅が変わっても対応関係は崩れない。
 */
export function RhythmTimeline({
  rows,
  timeSignature,
  selectedChordId,
  onSelectChord,
  onToggleAccent,
  showRhythm,
  showLyrics,
  measureNumberOffset = 0,
}: Props) {
  return (
    <div className="timeline">
      {rows.map((row) => (
        <MeasureView
          key={`${row.sectionId}-${row.measureIndex}`}
          row={row}
          ts={timeSignature}
          selectedChordId={selectedChordId}
          onSelectChord={onSelectChord}
          onToggleAccent={onToggleAccent}
          showRhythm={showRhythm}
          showLyrics={showLyrics}
          number={row.measureIndex + 1 + measureNumberOffset}
        />
      ))}
    </div>
  );
}

function MeasureView({
  row,
  ts,
  selectedChordId,
  onSelectChord,
  onToggleAccent,
  showRhythm,
  showLyrics,
  number,
}: {
  row: MeasureRow;
  ts: TimeSignature;
  selectedChordId?: string;
  onSelectChord?: (id: string) => void;
  onToggleAccent?: (chordId: string, lyricId: string) => void;
  showRhythm: boolean;
  showLyrics: boolean;
  number: number;
}) {
  const len = row.length;
  const beat = ticksPerBeat(ts);
  const gridTicks: number[] = [];
  for (let t = 0; t < len; t += SIXTEENTH) gridTicks.push(t);

  return (
    <div className="tl-measure" role="group" aria-label={`${number}小節目`}>
      <span className="tl-measure-num" aria-hidden>
        {number}
      </span>
      {/* 拍・細分化のグリッド線 */}
      <div className="tl-grid" aria-hidden>
        {gridTicks.map((t) => (
          <span
            key={t}
            className={`tl-gridline${t % beat === 0 ? " beat" : t % (SIXTEENTH * 2) === 0 ? " half" : ""}`}
            style={{ left: pct(t, len) }}
          />
        ))}
      </div>
      {/* 選択中のコードの範囲 */}
      {row.slots.map((slot) => (
        <button
          key={`hl-${slot.chord.id}-${slot.start}`}
          type="button"
          className={`tl-slot${slot.chord.id === selectedChordId ? " selected" : ""}`}
          style={{ left: pct(slot.start, len), width: pct(slot.length, len) }}
          onClick={() => onSelectChord?.(slot.chord.id)}
          aria-label={`${slot.chord.chordName} を選択`}
          aria-pressed={slot.chord.id === selectedChordId}
          tabIndex={onSelectChord ? 0 : -1}
        />
      ))}

      <div className="tl-row tl-chords">
        {row.slots.map((slot) => (
          <span
            key={`${slot.chord.id}-${slot.start}`}
            className={`tl-chord${slot.continued ? " continued" : ""}${slot.chord.id === selectedChordId ? " selected" : ""}`}
            style={{ left: pct(slot.start, len) }}
          >
            {slot.chord.id === selectedChordId && <span aria-hidden>▶</span>}
            {slot.continued ? `(${slot.chord.chordName})` : slot.chord.chordName}
          </span>
        ))}
      </div>

      {showRhythm && (
        <>
          <div className="tl-row tl-notes">
            {row.slots.map((slot) =>
              slot.pattern ? (
                <Notes key={`${slot.chord.id}-${slot.start}`} events={slot.rhythm} len={len} />
              ) : (
                <span
                  key={`${slot.chord.id}-${slot.start}`}
                  className="tl-empty"
                  style={{ left: pct(slot.start, len) }}
                >
                  リズム未設定
                </span>
              ),
            )}
          </div>
          <div className="tl-row tl-strokes">
            {row.slots.flatMap((slot) =>
              slot.rhythm
                .filter((e) => e.kind === "note" && !e.clippedStart)
                .map((e) => (
                  <span
                    key={`${slot.chord.id}-${e.id}`}
                    className={`tl-stroke a-${e.guitarAction}`}
                    style={{ left: pct(e.startTick, len) }}
                    title={ACTION_LABEL[e.guitarAction]}
                    aria-label={ACTION_LABEL[e.guitarAction]}
                  >
                    {ACTION_SYMBOL[e.guitarAction]}
                  </span>
                )),
            )}
          </div>
        </>
      )}

      <div className="tl-row tl-ruler" aria-hidden>
        {gridTicks.map((t) => {
          const l = subdivisionLabel(t, ts);
          return (
            <span key={t} className={`tl-tick${t % beat === 0 ? " beat" : ""}`} style={{ left: pct(t, len) }}>
              {t % beat === 0 || l === "&" ? l : "·"}
            </span>
          );
        })}
      </div>

      {showLyrics && (
        <div className="tl-row tl-lyrics">
          {row.slots.flatMap((slot) =>
            groupLyricsByTick(slot.lyrics).map((g) => (
              <span
                key={`${slot.chord.id}-${g.startTick}`}
                className="tl-lyric-group"
                style={{ left: pct(g.chars[0].measureTick, len) }}
              >
                {g.chars.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`lyric-char${c.accentMarked ? " accent" : ""}`}
                    onClick={() => onToggleAccent?.(slot.chord.id, c.id)}
                    aria-pressed={c.accentMarked}
                    aria-label={`「${c.text}」${c.accentMarked ? "演奏タイミングのマークあり" : ""}`}
                    disabled={!onToggleAccent}
                  >
                    {c.text}
                  </button>
                ))}
              </span>
            )),
          )}
        </div>
      )}
    </div>
  );
}

/** 音符・休符の並び。表記できない長さはタイで結んだ複数の音符に分けて描く。 */
function Notes({ events, len }: { events: PlacedRhythmEvent[]; len: number }) {
  const items: { tick: number; dur: number; rest: boolean; key: string }[] = [];
  const ties: { from: number; to: number; key: string }[] = [];
  let prevNoteStart: number | null = null;
  for (const e of events) {
    const rest = e.kind === "rest";
    const parts = splitIntoNotatable(e.durationTicks);
    let t = e.startTick;
    if (!rest && e.clippedStart) ties.push({ from: Math.max(0, t - SIXTEENTH * 2), to: t, key: `${e.id}-in` });
    if (!rest && e.guitarAction === "none" && prevNoteStart !== null && !e.clippedStart) {
      ties.push({ from: prevNoteStart, to: t, key: `${e.id}-tie` });
    }
    parts.forEach((d, i) => {
      items.push({ tick: t, dur: d, rest, key: `${e.id}-${i}` });
      if (!rest && i > 0) ties.push({ from: t - parts[i - 1], to: t, key: `${e.id}-p${i}` });
      if (!rest) prevNoteStart = t;
      t += d;
    });
    if (rest) prevNoteStart = null;
  }
  return (
    <Fragment>
      {items.map((it) => (
        <span key={it.key} className="tl-note" style={{ left: pct(it.tick, len) }}>
          <NoteGlyph value={notationForDuration(it.dur)} rest={it.rest} />
        </span>
      ))}
      {ties.map((t) => (
        <span
          key={t.key}
          className="tl-tie"
          style={{ left: `calc(${pct(t.from, len)} + 6px)`, width: `calc(${pct(t.to - t.from, len)})` }}
          aria-hidden
        />
      ))}
    </Fragment>
  );
}
