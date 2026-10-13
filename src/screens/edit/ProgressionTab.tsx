import { useState } from "react";
import { parseChord } from "../../music/chord";
import { beatsToTicks, ticksPerMeasure, ticksToBeats } from "../../music/timeline";
import { makeChord, makeSection } from "../../model/factory";
import { applyProgression, parseProgressionText, progressionToText } from "../../model/progressionText";
import { pruneForms, renameChord, setChordDuration, updateChord, updateSection } from "../../model/songOps";
import type { Section, Song } from "../../model/types";

type Props = { song: Song; onChange: (s: Song) => void };

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

export function ProgressionTab({ song, onChange }: Props) {
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);

  const setSections = (sections: Section[]) => onChange(pruneForms({ ...song, sections }));

  return (
    <div className="progression-editor">
      <p className="muted small">
        コードの長さは拍数（{ts.denominator}分音符 = 1拍、1小節 = {ts.numerator}拍）で指定します。一括入力では
        <code>| C | G | Am Em |</code> のように小節を <code>|</code> で区切り、<code>-</code>{" "}
        で直前のコードを伸ばせます。
      </p>
      {song.sections.map((section, si) => (
        <SectionEditor
          key={section.id}
          song={song}
          section={section}
          index={si}
          count={song.sections.length}
          onSongChange={onChange}
          onMove={(d) => setSections(move(song.sections, si, si + d))}
          onDelete={() => {
            if (window.confirm(`セクション「${section.name}」を削除しますか？`)) {
              setSections(song.sections.filter((s) => s.id !== section.id));
            }
          }}
          onDuplicate={() => {
            const copy = makeSection(
              `${section.name}（コピー）`,
              section.chords.map((c) => ({
                ...makeChord(c.chordName, c.durationTicks),
                formId: c.formId,
                rhythmPatternId: c.rhythmPatternId,
              })),
            );
            copy.rhythmPatternId = section.rhythmPatternId;
            const sections = [...song.sections];
            sections.splice(si + 1, 0, copy);
            setSections(sections);
          }}
        />
      ))}
      <button
        type="button"
        className="add-btn"
        onClick={() =>
          setSections([...song.sections, makeSection(`セクション${song.sections.length + 1}`, [makeChord("C", m)])])
        }
      >
        ＋ セクションを追加
      </button>
    </div>
  );
}

function SectionEditor({
  song,
  section,
  index,
  count,
  onSongChange,
  onMove,
  onDelete,
  onDuplicate,
}: {
  song: Song;
  section: Section;
  index: number;
  count: number;
  onSongChange: (s: Song) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);
  const [text, setText] = useState(() => progressionToText(section, ts));
  const [textError, setTextError] = useState<string | null>(null);
  const total = section.chords.reduce((a, c) => a + c.durationTicks, 0);
  const upd = (fn: (s: Section) => Section) => onSongChange(pruneForms(updateSection(song, section.id, fn)));

  const applyText = () => {
    try {
      const parsed = parseProgressionText(text, ts);
      const bad = parsed.filter((p) => !parseChord(p.chordName)).map((p) => p.chordName);
      if (bad.length && !window.confirm(`解析できないコード名があります（${bad.join(", ")}）。このまま適用しますか？`))
        return;
      if (
        parsed.length < section.chords.length &&
        !window.confirm(
          `コードが ${section.chords.length} 個から ${parsed.length} 個に減ります。後ろのコードの歌詞も削除されます。よろしいですか？`,
        )
      )
        return;
      upd((s) => ({ ...s, chords: applyProgression(s.chords, parsed) }));
      setTextError(null);
    } catch (e) {
      setTextError((e as Error).message);
    }
  };

  return (
    <section className="card section-editor" aria-label={`セクション ${section.name}`}>
      <div className="section-head">
        <input
          type="text"
          className="section-name-input"
          aria-label="セクション名"
          value={section.name}
          onChange={(e) => upd((s) => ({ ...s, name: e.target.value }))}
        />
        <div className="btn-row">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="上へ"
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="下へ"
          >
            ↓
          </button>
          <button type="button" className="small-btn" onClick={onDuplicate}>
            複製
          </button>
          <button type="button" className="small-btn danger" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>

      <label className="field inline-field">
        <span>リズム（セクション）</span>
        <select
          value={section.rhythmPatternId ?? ""}
          onChange={(e) => upd((s) => ({ ...s, rhythmPatternId: e.target.value || undefined }))}
        >
          <option value="">曲の既定に従う</option>
          {song.rhythmPatterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <details className="bulk">
        <summary>テキストで一括入力</summary>
        <div className="bulk-body">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="コード進行のテキスト"
            spellCheck={false}
          />
          <div className="btn-row">
            <button type="button" className="small-btn" onClick={() => setText(progressionToText(section, ts))}>
              現在の内容を読み込む
            </button>
            <button type="button" className="small-btn primary" onClick={applyText}>
              適用
            </button>
          </div>
          {textError && <p className="warn small">⚠ {textError}</p>}
        </div>
      </details>

      <ol className="chord-rows">
        {section.chords.map((chord, ci) => {
          const valid = !!parseChord(chord.chordName);
          const beats = ticksToBeats(chord.durationTicks, ts);
          return (
            <li key={chord.id} className="chord-row">
              <span className="chord-index">{ci + 1}</span>
              <input
                type="text"
                className={`chord-name-input${valid ? "" : " invalid"}`}
                aria-label="コード名"
                aria-invalid={!valid}
                value={chord.chordName}
                onChange={(e) => onSongChange(pruneForms(renameChord(song, chord.id, e.target.value.trim())))}
              />
              <label className="beats">
                <input
                  type="number"
                  aria-label="長さ（拍）"
                  min={0.25}
                  step={0.5}
                  value={beats}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) onSongChange(setChordDuration(song, chord.id, beatsToTicks(v, ts)));
                  }}
                />
                拍
              </label>
              <div className="quick-lengths">
                {[
                  ["½小節", m / 2],
                  ["1小節", m],
                  ["2小節", m * 2],
                ].map(([label, t]) => (
                  <button
                    key={label}
                    type="button"
                    className={`chip${chord.durationTicks === t ? " on" : ""}`}
                    onClick={() => onSongChange(setChordDuration(song, chord.id, t as number))}
                    disabled={!Number.isInteger(t)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                aria-label="リズム（コード個別）"
                value={chord.rhythmPatternId ?? ""}
                onChange={(e) =>
                  onSongChange(
                    updateChord(song, chord.id, (c) => ({ ...c, rhythmPatternId: e.target.value || undefined })),
                  )
                }
              >
                <option value="">リズム: セクションに従う</option>
                {song.rhythmPatterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    リズム: {p.name}
                  </option>
                ))}
              </select>
              <div className="btn-row">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="前へ"
                  disabled={ci === 0}
                  onClick={() => upd((s) => ({ ...s, chords: move(s.chords, ci, ci - 1) }))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="後ろへ"
                  disabled={ci === section.chords.length - 1}
                  onClick={() => upd((s) => ({ ...s, chords: move(s.chords, ci, ci + 1) }))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="後ろに追加"
                  onClick={() =>
                    upd((s) => {
                      const chords = [...s.chords];
                      chords.splice(ci + 1, 0, makeChord(chord.chordName, chord.durationTicks));
                      return { ...s, chords };
                    })
                  }
                >
                  ＋
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="削除"
                  onClick={() => {
                    if (chord.lyrics.length && !window.confirm("このコードの歌詞も削除されます。よろしいですか？"))
                      return;
                    upd((s) => ({ ...s, chords: s.chords.filter((c) => c.id !== chord.id) }));
                  }}
                >
                  ✕
                </button>
              </div>
              {!valid && (
                <span className="warn small row-note">
                  コード名を解析できません（例: C, Am, G7, Cmaj7, F#m, Bb, C/G）
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="section-foot">
        <button
          type="button"
          className="small-btn"
          onClick={() => upd((s) => ({ ...s, chords: [...s.chords, makeChord("C", m)] }))}
        >
          ＋ コードを追加
        </button>
        <span className={`small ${total % m === 0 ? "muted" : "warn"}`}>
          合計 {ticksToBeats(total, ts)} 拍（{(total / m).toFixed(2).replace(/\.?0+$/, "")} 小節）
          {total % m !== 0 && " ⚠ 小節の途中で終わっています"}
        </span>
      </div>
    </section>
  );
}
