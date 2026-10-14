import { useEffect, useMemo, useState } from "react";
import { player } from "../audio/player";
import { buildRangeSchedule } from "../audio/schedule";
import { effectiveMeasureEvents, songMeasures } from "../music/arrangement";
import { soundingNotes, type SoundingNote } from "../music/chord";
import { fitToLength, splitIntoMeasures } from "../music/measureRhythm";
import { EIGHTH, SIXTEENTH, ticksPerMeasure } from "../music/timeline";
import { newId } from "../model/factory";
import { resolveForm, setMeasureRhythm } from "../model/songOps";
import type { RhythmEvent, Song } from "../model/types";
import { TapRecorder } from "../screens/edit/TapRecorder";
import { StepEditor } from "./StepEditor";

export type RhythmClip = { events: Omit<RhythmEvent, "id">[]; lengthTicks: number; label: string };

type Props = {
  song: Song;
  /** 選択中の小節（曲全体の通し番号、両端を含む） */
  from: number;
  to: number;
  onSongChange: (song: Song) => void;
  clip: RhythmClip | null;
  onCopy: (clip: RhythmClip) => void;
  onClose: () => void;
};

type Tab = "tap" | "grid" | "pattern";

type Spec = Omit<RhythmEvent, "id">;
const key = (e: Spec) => `${e.startTick}/${e.durationTicks}/${e.kind}/${e.kind === "rest" ? "" : e.guitarAction}`;
/** 鳴り方が同じリズムか（順番と ID は問わない） */
function sameRhythm(a: Spec[], b: Spec[]): boolean {
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/**
 * 譜面で選んだ小節のリズムを直接入力するパネル。
 * 入力したリズムは小節ごとのリズム（パターンより優先）として保存される。
 */
export function MeasureRhythmPanel({ song, from, to, onSongChange, clip, onCopy, onClose }: Props) {
  const m = ticksPerMeasure(song.timeSignature);
  const measures = useMemo(() => songMeasures(song).slice(from, to + 1), [song, from, to]);
  const n = measures.length;
  const lengthTicks = n * m;
  const [tab, setTab] = useState<Tab>("tap");
  const [history, setHistory] = useState<Song[]>([]);
  const [playing, setPlaying] = useState(false);
  const [patternId, setPatternId] = useState(song.rhythmPatterns[0]?.id ?? "");

  // 選択範囲の今のリズム（直接入力 or パターン由来）を、範囲の頭からの位置で並べる
  const current: RhythmEvent[] = useMemo(
    () =>
      measures.flatMap((x, i) =>
        effectiveMeasureEvents(x.row).map((e) => ({ ...e, id: `${i}-${e.startTick}`, startTick: e.startTick + i * m })),
      ),
    [measures, m],
  );
  const aligned8 = current.every((e) => e.startTick % EIGHTH === 0 && e.durationTicks % EIGHTH === 0);
  const [stepTicks, setStepTicks] = useState(aligned8 ? EIGHTH : SIXTEENTH);

  useEffect(() => () => player.stop(), []);

  const commit = (next: Song) => {
    setHistory((h) => [...h.slice(-19), song]);
    onSongChange(next);
  };

  /** 範囲全体のリズムを小節ごとに分けて保存する */
  const apply = (events: Omit<RhythmEvent, "id">[]) => {
    const parts = splitIntoMeasures(events, m, n);
    let next = song;
    measures.forEach((x, i) => {
      // 中身が変わらない小節は、パターンのままにしておく（「個別」を増やさない）
      if (!x.row.custom && sameRhythm(parts[i], effectiveMeasureEvents(x.row))) return;
      next = setMeasureRhythm(next, x.sectionId, x.measure, parts[i]);
    });
    if (next !== song) commit(next);
  };

  const revert = () => {
    let next = song;
    for (const x of measures) next = setMeasureRhythm(next, x.sectionId, x.measure, null);
    commit(next);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onSongChange(prev);
  };

  // タップしたときに鳴らす音：その位置のコード
  const notesAt = (tick: number): SoundingNote[] => {
    const x = measures[Math.min(n - 1, Math.floor(tick / m))];
    if (!x) return [];
    const inMeasure = tick % m;
    const slot = x.row.slots.find((s) => inMeasure >= s.start && inMeasure < s.start + s.length) ?? x.row.slots[0];
    const form = slot ? resolveForm(song, slot.chord).form : null;
    return form ? soundingNotes(form.positions) : [];
  };

  const togglePreview = async () => {
    if (player.playing) {
      player.stop();
      return;
    }
    setPlaying(true);
    await player.play(buildRangeSchedule(song, measures[0].absStart, measures[n - 1].absStart + m), {
      onEnd: () => setPlaying(false),
    });
  };

  const customCount = measures.filter((x) => x.row.custom).length;
  const label = n === 1 ? `${from + 1}小節目` : `${from + 1}〜${to + 1}小節目（${n}小節）`;

  return (
    <div className="measure-panel" role="region" aria-label="小節のリズム">
      <div className="measure-panel-head">
        <strong>{label}</strong>
        <span className="muted small">
          {customCount === 0
            ? "パターンのリズム"
            : customCount === n
              ? "直接入力したリズム"
              : `${customCount}小節は直接入力`}
        </span>
        <div className="btn-row" style={{ margin: 0 }}>
          <button
            type="button"
            className="small-btn primary"
            onClick={() => void togglePreview()}
            aria-pressed={playing}
          >
            {playing ? "■ 停止" : "▶ 聴く"}
          </button>
          <button type="button" className="small-btn" onClick={undo} disabled={history.length === 0}>
            ↶ 元に戻す
          </button>
          <button type="button" className="small-btn" onClick={onClose}>
            選択を解除
          </button>
        </div>
      </div>

      <p className="muted small" style={{ margin: "4px 0 0" }}>
        別の小節をタップすると、そこまで範囲を広げます。選び直すときは「選択を解除」を押してください。
      </p>
      <div className="tabs small-tabs" role="tablist" aria-label="入力方法">
        {(
          [
            ["tap", "タップで録音"],
            ["grid", "マス目で編集"],
            ["pattern", "パターン・コピー"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "tap" && (
        <TapRecorder
          key={`${from}-${to}`}
          current={{ events: current, lengthTicks }}
          tempo={song.tempo}
          timeSignature={song.timeSignature}
          notes={notesAt(0)}
          notesAt={notesAt}
          measureTicks={m}
          fixedLengthTicks={lengthTicks}
          onUndo={undo}
          onApply={(events, _len, gridTicks) => {
            if (gridTicks && gridTicks < stepTicks) setStepTicks(gridTicks);
            apply(events);
          }}
        />
      )}

      {tab === "grid" && (
        <StepEditor
          events={current}
          lengthTicks={lengthTicks}
          timeSignature={song.timeSignature}
          stepTicks={stepTicks}
          onStepTicksChange={setStepTicks}
          onChange={apply}
          firstMeasureNumber={from + 1}
        />
      )}

      {tab === "pattern" && (
        <div className="pattern-tools">
          <div className="btn-row">
            <span className="small">パターンを当てはめる</span>
            <select value={patternId} onChange={(e) => setPatternId(e.target.value)} aria-label="当てはめるパターン">
              {song.rhythmPatterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="small-btn"
              disabled={!patternId}
              onClick={() => {
                const p = song.rhythmPatterns.find((x) => x.id === patternId);
                if (p) apply(fitToLength(p.events, p.lengthTicks, lengthTicks));
              }}
            >
              当てはめる
            </button>
          </div>
          <div className="btn-row">
            <span className="small">コピー</span>
            <button
              type="button"
              className="small-btn"
              onClick={() => onCopy({ events: current.map(({ id: _id, ...e }) => e), lengthTicks, label })}
            >
              この{n}小節をコピー
            </button>
            <button
              type="button"
              className="small-btn"
              disabled={!clip}
              onClick={() => clip && apply(fitToLength(clip.events, clip.lengthTicks, lengthTicks))}
            >
              貼り付け{clip ? `（${clip.label}）` : ""}
            </button>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                const name = window.prompt("パターンの名前", `${label}のリズム`);
                if (!name) return;
                commit({
                  ...song,
                  rhythmPatterns: [
                    ...song.rhythmPatterns,
                    { id: newId(), name, lengthTicks, events: current.map((e) => ({ ...e, id: newId() })) },
                  ],
                });
              }}
            >
              パターンとして保存
            </button>
            <button type="button" className="small-btn danger" onClick={revert} disabled={customCount === 0}>
              直接入力をやめてパターンに戻す
            </button>
          </div>
          <p className="muted small">
            貼り付け・当てはめは、選んだ小節の長さに合わせてくり返します。直接入力した小節は、コードやセクションのパターン設定より優先されます。
          </p>
        </div>
      )}
    </div>
  );
}
