// 歌詞の入力（テキスト）とタイミング（16分のマス目）の編集部品。譜面の「歌詞」編集で使う。
import { useState } from "react";
import { distributeTicks, lyricsText, sortLyrics, toggleAccent } from "../music/lyrics";
import { SIXTEENTH, subdivisionLabel, ticksPerBeat, ticksPerMeasure, toMusicalPosition } from "../music/timeline";
import type { ChordEvent, Song } from "../model/types";

/** 入力中は文字列のまま保持し、確定（フォーカスアウト・Enter）時に文字単位のイベントへ反映する */
export function LyricInput({
  chord,
  onCommit,
  onFocus,
}: {
  chord: ChordEvent;
  onCommit: (t: string) => void;
  onFocus: () => void;
}) {
  const committed = lyricsText(chord.lyrics);
  const [text, setText] = useState(committed);
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (committed !== lastCommitted) {
    // 外部（タイミング編集など）で変わった場合に追従する
    setLastCommitted(committed);
    setText(committed);
  }
  const commit = () => {
    if (text !== committed) onCommit(text);
  };
  return (
    <input
      type="text"
      className="lyric-input"
      aria-label={`${chord.chordName} の歌詞`}
      value={text}
      placeholder="（歌詞なし）"
      onFocus={onFocus}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function TimingEditor({
  song,
  chord,
  absStart,
  sectionName,
  onChange,
}: {
  song: Song;
  chord: ChordEvent;
  absStart: number;
  sectionName: string;
  onChange: (c: ChordEvent) => void;
}) {
  const ts = song.timeSignature;
  const beat = ticksPerBeat(ts);
  const m = ticksPerMeasure(ts);
  const lyrics = sortLyrics(chord.lyrics);
  const [selected, setSelected] = useState<string | undefined>(lyrics[0]?.id);
  const [mode, setMode] = useState<"move" | "mark">("move");
  const sel = lyrics.find((l) => l.id === selected);
  const cells: number[] = [];
  for (let t = 0; t < chord.durationTicks; t += SIXTEENTH) cells.push(t);
  const maxTick = cells[cells.length - 1] ?? 0;

  // 文字の順序（＝歌詞の並び）は変えず、前後の文字の位置の間でだけ動かす
  const setTick = (id: string, tick: number) => {
    const i = lyrics.findIndex((l) => l.id === id);
    const lo = i > 0 ? lyrics[i - 1].startTick : 0;
    const hi = i < lyrics.length - 1 ? lyrics[i + 1].startTick : maxTick;
    const t = Math.min(hi, Math.max(lo, tick));
    onChange({ ...chord, lyrics: chord.lyrics.map((l) => (l.id === id ? { ...l, startTick: t } : l)) });
  };
  const lo = sel ? (lyrics[lyrics.indexOf(sel) - 1]?.startTick ?? 0) : 0;
  const hi = sel ? (lyrics[lyrics.indexOf(sel) + 1]?.startTick ?? maxTick) : maxTick;

  const pos = (tick: number) => {
    const p = toMusicalPosition(absStart + tick, ts);
    const sub = subdivisionLabel((absStart + tick) % m, ts);
    return `${p.measure}小節 ${p.beat}拍${p.tickInBeat ? `（${sub || `+${p.tickInBeat}`}）` : ""}`;
  };

  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">
          タイミング: {sectionName} / {chord.chordName}
        </h2>
        <div className="segmented small" role="radiogroup" aria-label="タップの動作">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "move"}
            className={mode === "move" ? "on" : ""}
            onClick={() => setMode("move")}
          >
            位置を調整
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "mark"}
            className={mode === "mark" ? "on" : ""}
            onClick={() => setMode("mark")}
          >
            マークを付ける
          </button>
        </div>
      </div>
      {lyrics.length === 0 ? (
        <p className="muted">このコードには歌詞がありません。</p>
      ) : (
        <>
          <p className="muted small">
            {mode === "move"
              ? "文字を選んでから、下のマス（16分音符単位）をタップするとその位置へ移動します（前後の文字を越えては動きません）。同じ位置に複数の文字を置けます。"
              : "文字をタップすると「この位置でギターを弾く」マークを付け外しします。"}
          </p>
          <div className="lyric-chips">
            {lyrics.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`lyric-chip${l.id === selected && mode === "move" ? " on" : ""}${l.accentMarked ? " accent" : ""}`}
                onClick={() =>
                  mode === "move" ? setSelected(l.id) : onChange({ ...chord, lyrics: toggleAccent(chord.lyrics, l.id) })
                }
                aria-pressed={mode === "move" ? l.id === selected : l.accentMarked}
              >
                {l.text === " " ? "␣" : l.text}
              </button>
            ))}
          </div>
          <div className="timing-grid-wrap">
            <div className="timing-grid" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(24px, 1fr))` }}>
              {cells.map((t) => {
                const here = lyrics.filter((l) => l.startTick === t);
                const inMeasure = (absStart + t) % m;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`timing-cell${inMeasure % beat === 0 ? " beat" : ""}${inMeasure === 0 ? " bar" : ""}${sel && sel.startTick === t ? " on" : ""}${sel && mode === "move" && (t < lo || t > hi) ? " out" : ""}`}
                    onClick={() => sel && mode === "move" && setTick(sel.id, t)}
                    aria-label={`${pos(t)}${here.length ? ` 「${here.map((h) => h.text).join("")}」` : ""}`}
                  >
                    <span className="timing-chars">
                      {here.map((h) => (
                        <span
                          key={h.id}
                          className={`${h.accentMarked ? "accent" : ""}${h.id === selected ? " sel" : ""}`}
                        >
                          {h.text}
                        </span>
                      ))}
                    </span>
                    <span className="timing-label">{subdivisionLabel(inMeasure, ts) || "·"}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {sel && mode === "move" && (
            <div className="btn-row">
              <span className="small">
                「{sel.text}」: {pos(sel.startTick)}
              </span>
              <button
                type="button"
                className="small-btn"
                onClick={() => setTick(sel.id, sel.startTick - SIXTEENTH)}
                disabled={sel.startTick <= lo}
              >
                ◀ 16分
              </button>
              <button
                type="button"
                className="small-btn"
                onClick={() => setTick(sel.id, sel.startTick + SIXTEENTH)}
                disabled={sel.startTick >= hi}
              >
                16分 ▶
              </button>
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  // 選択した文字以降を同じだけずらす
                  const delta = SIXTEENTH;
                  onChange({
                    ...chord,
                    lyrics: chord.lyrics.map((l) =>
                      l.startTick >= sel.startTick ? { ...l, startTick: Math.min(maxTick, l.startTick + delta) } : l,
                    ),
                  });
                }}
              >
                以降をまとめて ▶
              </button>
            </div>
          )}
          <div className="btn-row end">
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                const ticks = distributeTicks(lyrics.length, chord.durationTicks, SIXTEENTH);
                const order = new Map(lyrics.map((l, i) => [l.id, ticks[i]]));
                onChange({ ...chord, lyrics: chord.lyrics.map((l) => ({ ...l, startTick: order.get(l.id)! })) });
              }}
            >
              均等に再配置
            </button>
          </div>
        </>
      )}
    </div>
  );
}
