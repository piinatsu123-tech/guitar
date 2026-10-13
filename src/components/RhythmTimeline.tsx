import { Fragment, type ReactNode } from "react";
import type { MeasureRow, MeasureSlotView } from "../music/arrangement";
import { soundingNotes, type GuitarStringPosition } from "../music/chord";
import { groupLyricsByTick } from "../music/lyrics";
import type { NoteLabelMode } from "../music/pitch";
import {
  notationForDuration,
  SIXTEENTH,
  splitIntoNotatable,
  subdivisionLabel,
  ticksPerBeat,
  type PlacedRhythmEvent,
} from "../music/timeline";
import type { ChordEvent, GuitarAction, TimeSignature } from "../model/types";
import { NoteGlyph } from "./NoteGlyph";
import { PianoView } from "./PianoView";
import { TabView } from "./TabView";

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

/** コード図・鍵盤の描画に必要な情報（フォームが解決できなければ null） */
export type ChordVisual = { positions: GuitarStringPosition[]; rootPc: number | null } | null;

export type TimelineDisplay = {
  /** "score": 譜面（コード図→鍵盤→歌詞→音符→ストローク）、"detail": 詳細（コード名→音符→ストローク→歌詞） */
  variant: "score" | "detail";
  showDiagram: boolean;
  showPiano: boolean;
  showLyrics: boolean;
  showRhythm: boolean;
  showStrokes: boolean;
  tabLabelMode: NoteLabelMode;
  pianoLabelMode: NoteLabelMode;
};

type Props = {
  rows: MeasureRow[];
  timeSignature: TimeSignature;
  display: TimelineDisplay;
  /** コード図・鍵盤を描く場合に必要 */
  visualFor?: (chord: ChordEvent) => ChordVisual;
  selectedChordId?: string;
  onSelectChord?: (chordId: string) => void;
  onToggleAccent?: (chordId: string, lyricId: string) => void;
  /** 小節番号の表示に使う（通し番号の開始値） */
  measureNumberOffset?: number;
  className?: string;
};

const pct = (tick: number, len: number) => `${(tick / len) * 100}%`;
const slotKey = (slot: MeasureSlotView) => `${slot.chord.id}-${slot.start}`;

/**
 * 小節単位のタイムライン。コード・鍵盤・歌詞・音符・ストローク・拍目盛りを共通の tick 軸に並べる。
 * 位置はすべて「小節内 tick ÷ 小節長」の割合なので、画面幅が変わっても対応関係は崩れない。
 */
export function RhythmTimeline({
  rows,
  timeSignature,
  display,
  visualFor,
  selectedChordId,
  onSelectChord,
  onToggleAccent,
  measureNumberOffset = 0,
  className = "",
}: Props) {
  return (
    <div className={`timeline tl-${display.variant} ${className}`}>
      {rows.map((row) => (
        <MeasureView
          key={`${row.sectionId}-${row.measureIndex}`}
          row={row}
          ts={timeSignature}
          display={display}
          visualFor={visualFor}
          selectedChordId={selectedChordId}
          onSelectChord={onSelectChord}
          onToggleAccent={onToggleAccent}
          number={row.measureIndex + 1 + measureNumberOffset}
        />
      ))}
    </div>
  );
}

function MeasureView({
  row,
  ts,
  display,
  visualFor,
  selectedChordId,
  onSelectChord,
  onToggleAccent,
  number,
}: {
  row: MeasureRow;
  ts: TimeSignature;
  display: TimelineDisplay;
  visualFor?: (chord: ChordEvent) => ChordVisual;
  selectedChordId?: string;
  onSelectChord?: (id: string) => void;
  onToggleAccent?: (chordId: string, lyricId: string) => void;
  number: number;
}) {
  const len = row.length;
  const beat = ticksPerBeat(ts);
  const gridTicks: number[] = [];
  for (let t = 0; t < len; t += SIXTEENTH) gridTicks.push(t);
  const selected = (slot: MeasureSlotView) => slot.chord.id === selectedChordId;

  const chordNames = (
    <div className="tl-row tl-chords" key="chords">
      {row.slots.map((slot) => (
        <span
          key={slotKey(slot)}
          className={`tl-chord${slot.continued ? " continued" : ""}${selected(slot) ? " selected" : ""}`}
          style={{ left: pct(slot.start, len) }}
        >
          {selected(slot) && <span aria-hidden>▶</span>}
          {slot.continued ? `(${slot.chord.chordName})` : slot.chord.chordName}
        </span>
      ))}
    </div>
  );

  // 譜面表示: コード名＋コード図（TAB）。小節をまたいで続くコードは名前だけ小さく出す。
  const diagrams = (
    <div className="tl-row tl-diagrams" key="diagrams">
      {row.slots.map((slot) => {
        const visual = !slot.continued && display.showDiagram ? visualFor?.(slot.chord) : null;
        return (
          <span
            key={slotKey(slot)}
            className={`tl-diagram${slot.continued ? " continued" : ""}${selected(slot) ? " selected" : ""}`}
            style={{ left: pct(slot.start, len), width: pct(slot.length, len) }}
          >
            <span className="tl-diagram-name">
              {slot.continued ? `(${slot.chord.chordName})` : slot.chord.chordName}
            </span>
            {visual && (
              <span className="tl-diagram-box">
                <TabView
                  positions={visual.positions}
                  labelMode={display.tabLabelMode}
                  rootPc={visual.rootPc}
                  compact
                  fretCount={4}
                />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );

  const pianos = (
    <div className="tl-row tl-pianos" key="pianos">
      {row.slots
        .filter((slot) => !slot.continued)
        .map((slot) => {
          const visual = visualFor?.(slot.chord);
          return (
            <span
              key={slotKey(slot)}
              className="tl-piano"
              style={{ left: pct(slot.start, len), width: pct(slot.length, len) }}
            >
              {visual && (
                <PianoView
                  notes={soundingNotes(visual.positions)}
                  labelMode={display.pianoLabelMode}
                  rootPc={visual.rootPc}
                />
              )}
            </span>
          );
        })}
    </div>
  );

  const notes = (
    <div className="tl-row tl-notes" key="notes">
      {row.slots.map((slot) =>
        slot.pattern ? (
          <Notes key={slotKey(slot)} events={slot.rhythm} len={len} />
        ) : (
          <span key={slotKey(slot)} className="tl-empty" style={{ left: pct(slot.start, len) }}>
            リズム未設定
          </span>
        ),
      )}
    </div>
  );

  const strokes = (
    <div className="tl-row tl-strokes" key="strokes">
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
  );

  const ruler = (
    <div className="tl-row tl-ruler" aria-hidden key="ruler">
      {gridTicks.map((t) => {
        const l = subdivisionLabel(t, ts);
        return (
          <span key={t} className={`tl-tick${t % beat === 0 ? " beat" : ""}`} style={{ left: pct(t, len) }}>
            {t % beat === 0 || l === "&" ? l : "·"}
          </span>
        );
      })}
    </div>
  );

  const lyrics = (
    <div className="tl-row tl-lyrics" key="lyrics">
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
  );

  const d = display;
  const order: ReactNode[] =
    d.variant === "score"
      ? [
          diagrams,
          d.showPiano && pianos,
          d.showLyrics && lyrics,
          d.showRhythm && notes,
          d.showStrokes && strokes,
          (d.showRhythm || d.showStrokes) && ruler,
        ]
      : [chordNames, d.showRhythm && notes, d.showStrokes && strokes, ruler, d.showLyrics && lyrics];

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
      {/* コードの範囲（タップで選択） */}
      {row.slots.map((slot) => (
        <button
          key={`hl-${slotKey(slot)}`}
          type="button"
          className={`tl-slot${selected(slot) ? " selected" : ""}`}
          style={{ left: pct(slot.start, len), width: pct(slot.length, len) }}
          onClick={() => onSelectChord?.(slot.chord.id)}
          aria-label={`${slot.chord.chordName} を選択`}
          aria-pressed={selected(slot)}
          tabIndex={onSelectChord ? 0 : -1}
        />
      ))}
      {order}
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
