import { useEffect, useState } from "react";
import { player } from "../../audio/player";
import { buildPatternSchedule } from "../../audio/schedule";
import { TapRecorder } from "./TapRecorder";
import { soundingNotes } from "../../music/chord";
import { autoForm, chordNamesInSong, resolveForm } from "../../model/songOps";
import { ACTION_LABEL, ACTION_SYMBOL, RhythmTimeline } from "../../components/RhythmTimeline";
import { makeChord, makePattern, newId } from "../../model/factory";
import { deletePattern } from "../../model/songOps";
import type { GuitarAction, RhythmPattern, Song } from "../../model/types";
import type { MeasureRow } from "../../music/arrangement";
import {
  EIGHTH,
  eventsToSteps,
  SIXTEENTH,
  stepsToEvents,
  subdivisionLabel,
  tilePattern,
  ticksPerBeat,
  ticksPerMeasure,
  validatePattern,
  type Step,
} from "../../music/timeline";

type Props = { song: Song; onChange: (s: Song) => void };

const ACTIONS: GuitarAction[] = ["downstroke", "upstroke", "pluck", "mute", "none"];

export function RhythmTab({ song, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(song.rhythmPatterns[0]?.id);
  const pattern = song.rhythmPatterns.find((p) => p.id === selectedId) ?? song.rhythmPatterns[0];
  const m = ticksPerMeasure(song.timeSignature);

  const updatePattern = (p: RhythmPattern) =>
    onChange({ ...song, rhythmPatterns: song.rhythmPatterns.map((x) => (x.id === p.id ? p : x)) });

  const addPattern = (base?: RhythmPattern) => {
    const p: RhythmPattern = base
      ? {
          ...base,
          id: newId(),
          name: `${base.name}（コピー）`,
          events: base.events.map((e) => ({ ...e, id: newId() })),
        }
      : makePattern("新しいパターン", m, [[0, m, "note", "downstroke"]]);
    onChange({ ...song, rhythmPatterns: [...song.rhythmPatterns, p] });
    setSelectedId(p.id);
  };

  const usage = (id: string) => {
    const n =
      (song.defaultRhythmPatternId === id ? 1 : 0) +
      song.sections.filter((s) => s.rhythmPatternId === id).length +
      song.sections.reduce((a, s) => a + s.chords.filter((c) => c.rhythmPatternId === id).length, 0);
    return n;
  };

  return (
    <div className="rhythm-editor">
      <div className="card">
        <h2 className="card-title">適用先</h2>
        <label className="field inline-field">
          <span>曲の既定パターン</span>
          <select
            value={song.defaultRhythmPatternId ?? ""}
            onChange={(e) => onChange({ ...song, defaultRhythmPatternId: e.target.value || undefined })}
          >
            <option value="">なし</option>
            {song.rhythmPatterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {song.sections.map((s) => (
          <label key={s.id} className="field inline-field">
            <span>{s.name}</span>
            <select
              value={s.rhythmPatternId ?? ""}
              onChange={(e) =>
                onChange({
                  ...song,
                  sections: song.sections.map((x) =>
                    x.id === s.id ? { ...x, rhythmPatternId: e.target.value || undefined } : x,
                  ),
                })
              }
            >
              <option value="">曲の既定に従う</option>
              {song.rhythmPatterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="muted small">
          コードごとの個別指定は「コード進行」タブで設定できます（コード → セクション → 曲の既定 の順に優先）。
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">パターン</h2>
        <div className="chip-row">
          {song.rhythmPatterns.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${p.id === pattern?.id ? " on" : ""}`}
              onClick={() => setSelectedId(p.id)}
            >
              {p.name}
              <span className="muted small"> ({usage(p.id)})</span>
            </button>
          ))}
          <button type="button" className="chip add" onClick={() => addPattern()}>
            ＋ 新規
          </button>
        </div>
        {pattern && (
          <PatternEditor
            key={pattern.id}
            song={song}
            pattern={pattern}
            onChange={updatePattern}
            onDuplicate={() => addPattern(pattern)}
            onDelete={() => {
              const n = usage(pattern.id);
              if (
                !window.confirm(
                  `パターン「${pattern.name}」を削除しますか？${n ? `（${n}箇所で使用中。参照は解除されます）` : ""}`,
                )
              )
                return;
              onChange(deletePattern(song, pattern.id));
              setSelectedId(undefined);
            }}
          />
        )}
      </div>
    </div>
  );
}

function PatternEditor({
  song,
  pattern,
  onChange,
  onDuplicate,
  onDelete,
}: {
  song: Song;
  pattern: RhythmPattern;
  onChange: (p: RhythmPattern) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ts = song.timeSignature;
  const beat = ticksPerBeat(ts);
  const [previewChord, setPreviewChord] = useState(() => {
    const user = song.sections.flatMap((s) => s.chords).find((c) => c.rhythmPatternId === pattern.id);
    return user?.chordName ?? chordNamesInSong(song)[0] ?? "C";
  });
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => player.stop(), []);
  // 曲で保存したフォームがあればそれを、なければ自動生成のフォームを使う
  const previewNotes = () => {
    const event = song.sections.flatMap((s) => s.chords).find((c) => c.chordName === previewChord);
    const form = event ? resolveForm(song, event).form : autoForm(previewChord);
    return form ? soundingNotes(form.positions) : [];
  };
  const togglePreview = async () => {
    if (player.playing) {
      player.stop();
      return;
    }
    const notes = previewNotes();
    if (notes.length === 0) return;
    setPlaying(true);
    await player.play(buildPatternSchedule(pattern, song.tempo, notes, 4), {
      onEnd: () => setPlaying(false),
    });
  };

  const m = ticksPerMeasure(ts);
  const aligned16 = pattern.events.every((e) => e.startTick % SIXTEENTH === 0 && e.durationTicks % SIXTEENTH === 0);
  const aligned8 = pattern.events.every((e) => e.startTick % EIGHTH === 0 && e.durationTicks % EIGHTH === 0);
  const [stepTicks, setStepTicks] = useState(aligned8 ? EIGHTH : SIXTEENTH);
  const [cursor, setCursor] = useState(0);
  const steps = eventsToSteps(pattern.events, pattern.lengthTicks, stepTicks);
  const errors = validatePattern(pattern);

  const setSteps = (next: Step[]) =>
    onChange({ ...pattern, events: stepsToEvents(next, stepTicks, newId, pattern.events) });
  const setStep = (i: number, patch: Partial<Step>) => {
    const next = steps.map((s, j) => (j === i ? { ...s, ...patch } : s));
    if (next[i].state !== "note") next[i].action = "none";
    else if (patch.state === "note" && steps[i].state !== "note") next[i].action = "downstroke";
    setSteps(next);
  };

  const setLength = (ticks: number) => {
    if (ticks <= 0) return;
    // 長さを変えたら範囲外のイベントを切り詰める
    const events = pattern.events
      .filter((e) => e.startTick < ticks)
      .map((e) => ({ ...e, durationTicks: Math.min(e.durationTicks, ticks - e.startTick) }));
    const used = events.reduce((a, e) => Math.max(a, e.startTick + e.durationTicks), 0);
    if (used < ticks)
      events.push({ id: newId(), startTick: used, durationTicks: ticks - used, kind: "rest", guitarAction: "none" });
    onChange({ ...pattern, lengthTicks: ticks, events });
  };

  // プレビュー用：パターンの長さ分を1つのコードとして小節に並べる
  const previewRows: MeasureRow[] = [];
  const preview = makeChord("—", pattern.lengthTicks);
  for (let start = 0; start < pattern.lengthTicks; start += m) {
    const len = Math.min(m, pattern.lengthTicks - start);
    previewRows.push({
      sectionId: "preview",
      measureIndex: start / m,
      absStart: start,
      length: m,
      slots: [
        {
          chord: { ...preview, chordName: pattern.name },
          start: 0,
          length: len,
          continued: start > 0,
          pattern,
          rhythm: tilePattern(pattern, start, len),
          lyrics: [],
        },
      ],
    });
  }

  const cur = steps[Math.min(cursor, steps.length - 1)];
  const lengthOptions = [beat * 2, m / 2, m, m * 2].filter(
    (t, i, a) => Number.isInteger(t) && t > 0 && a.indexOf(t) === i,
  );

  return (
    <div className="pattern-editor">
      <div className="form-grid">
        <label className="field">
          <span>名前</span>
          <input type="text" value={pattern.name} onChange={(e) => onChange({ ...pattern, name: e.target.value })} />
        </label>
        <label className="field">
          <span>長さ</span>
          <select value={pattern.lengthTicks} onChange={(e) => setLength(Number(e.target.value))}>
            {!lengthOptions.includes(pattern.lengthTicks) && (
              <option value={pattern.lengthTicks}>{pattern.lengthTicks / beat}拍</option>
            )}
            {lengthOptions.map((t) => (
              <option key={t} value={t}>
                {t % m === 0 ? `${t / m}小節` : `${t / beat}拍`}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>グリッド</span>
          <div className="segmented" role="radiogroup" aria-label="グリッド">
            <button
              type="button"
              role="radio"
              aria-checked={stepTicks === EIGHTH}
              className={stepTicks === EIGHTH ? "on" : ""}
              disabled={!aligned8}
              onClick={() => setStepTicks(EIGHTH)}
              title={aligned8 ? "" : "16分音符の位置にイベントがあるため選べません"}
            >
              8分
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={stepTicks === SIXTEENTH}
              className={stepTicks === SIXTEENTH ? "on" : ""}
              disabled={!aligned16}
              onClick={() => setStepTicks(SIXTEENTH)}
            >
              16分
            </button>
          </div>
        </div>
      </div>

      <p className="muted small">
        マスを選んでから下のボタンで「音符・休符・伸ばす」と「弾き方」を設定します。「伸ばす」は直前の音符・休符を長くします。音符でも「弾かない（—）」にすると、新しく弾かずに音を伸ばす（タイ）扱いになります。
      </p>

      <div
        className="step-grid"
        role="grid"
        aria-label="リズムのステップ"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(26px, 1fr))` }}
      >
        {steps.map((s, i) => {
          const tick = (i * stepTicks) % m;
          const label = subdivisionLabel(tick, ts);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`step ${s.state}${i === cursor ? " cursor" : ""}${tick % beat === 0 ? " beat" : ""}${tick === 0 ? " bar" : ""}`}
              onClick={() => setCursor(i)}
              aria-selected={i === cursor}
              aria-label={`${label || "·"} ${s.state === "note" ? "音符" : s.state === "rest" ? "休符" : "伸ばす"} ${s.state === "note" ? ACTION_LABEL[s.action] : ""}`}
            >
              <span className="step-state">{s.state === "note" ? "♪" : s.state === "rest" ? "休" : "～"}</span>
              <span className="step-action">{s.state === "note" ? ACTION_SYMBOL[s.action] : ""}</span>
              <span className="step-label">{label || "·"}</span>
            </button>
          );
        })}
      </div>

      {cur && (
        <div className="step-tools">
          <div className="btn-row">
            <span className="small">種類:</span>
            <button
              type="button"
              className={`chip${cur.state === "note" ? " on" : ""}`}
              onClick={() => setStep(cursor, { state: "note" })}
            >
              ♪ 音符
            </button>
            <button
              type="button"
              className={`chip${cur.state === "rest" ? " on" : ""}`}
              onClick={() => setStep(cursor, { state: "rest" })}
            >
              休符
            </button>
            <button
              type="button"
              className={`chip${cur.state === "hold" ? " on" : ""}`}
              onClick={() => setStep(cursor, { state: "hold" })}
              disabled={cursor === 0}
              title={cursor === 0 ? "先頭は伸ばせません（音符＋「弾かない」でタイを表せます）" : ""}
            >
              ～ 伸ばす
            </button>
          </div>
          <div className="btn-row">
            <span className="small">弾き方:</span>
            {ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className={`chip${cur.state === "note" && cur.action === a ? " on" : ""}`}
                disabled={cur.state !== "note"}
                onClick={() => setStep(cursor, { action: a })}
                title={ACTION_LABEL[a]}
              >
                {ACTION_SYMBOL[a]} {ACTION_LABEL[a].replace(/（.*）/, "")}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="small-btn" onClick={() => setCursor((c) => Math.max(0, c - 1))}>
              ◀ 前のマス
            </button>
            <button
              type="button"
              className="small-btn"
              onClick={() => setCursor((c) => Math.min(steps.length - 1, c + 1))}
            >
              次のマス ▶
            </button>
          </div>
        </div>
      )}

      {errors.length > 0 && <p className="warn small">⚠ {errors.join(" / ")}</p>}

      <TapRecorder
        pattern={pattern}
        tempo={song.tempo}
        timeSignature={ts}
        gridTicks={stepTicks}
        notes={previewNotes()}
        onApply={(events) => onChange({ ...pattern, events })}
      />

      <h3 className="block-title">プレビュー</h3>
      <div className="btn-row">
        <button
          type="button"
          className={`small-btn primary`}
          onClick={() => void togglePreview()}
          aria-pressed={playing}
        >
          {playing ? "■ 停止" : "▶ 試聴（4回）"}
        </button>
        <label className="field inline-field" style={{ margin: 0 }}>
          <span>コード</span>
          <select value={previewChord} onChange={(e) => setPreviewChord(e.target.value)}>
            {[...new Set([...chordNamesInSong(song), "C", "G", "Am", "E"])].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">♩={song.tempo}</span>
      </div>
      <RhythmTimeline
        rows={previewRows}
        timeSignature={ts}
        display={{
          variant: "detail",
          showDiagram: false,
          showPiano: false,
          showLyrics: false,
          showRhythm: true,
          showStrokes: true,
          tabLabelMode: "hidden",
          pianoLabelMode: "hidden",
        }}
      />

      <div className="btn-row end">
        <button type="button" className="small-btn" onClick={onDuplicate}>
          複製
        </button>
        <button type="button" className="small-btn danger" onClick={onDelete}>
          削除
        </button>
      </div>
    </div>
  );
}
