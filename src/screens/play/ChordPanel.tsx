import { useState } from "react";
import { FormAnalysisView } from "../../components/FormAnalysisView";
import { PianoView } from "../../components/PianoView";
import { TabView } from "../../components/TabView";
import { formShorthand, parseChord, soundingNotes } from "../../music/chord";
import { beatsToTicks, ticksPerMeasure, ticksToBeats } from "../../music/timeline";
import { applyProgression, parseProgressionText, progressionToText } from "../../model/progressionText";
import {
  addSection,
  chordNamesInSong,
  deleteChord,
  deleteSection,
  duplicateSection,
  findChord,
  insertChord,
  moveSection,
  pruneForms,
  renameChord,
  resolveForm,
  setChordDuration,
  splitChord,
  updateChord,
  updateSection,
} from "../../model/songOps";
import type { DisplaySettings, Song } from "../../model/types";

type Props = {
  song: Song;
  settings: DisplaySettings;
  chordId: string | undefined;
  onSongChange: (song: Song) => void;
  onSelectChord: (id: string) => void;
  onEditForm: () => void;
};

/** 譜面で選んだコードと、そのセクションを編集するパネル */
export function ChordPanel({ song, settings, chordId, onSongChange, onSelectChord, onEditForm }: Props) {
  const [tab, setTab] = useState<"chord" | "section">("chord");
  const found = findChord(song, chordId);
  const m = ticksPerMeasure(song.timeSignature);

  if (!found) {
    return (
      <div className="edit-panel" role="region" aria-label="コードの編集">
        <p>まだコードがありません。</p>
        <button
          type="button"
          className="small-btn primary"
          onClick={() => {
            const next = addSection(song, null, "Aメロ", m);
            onSongChange(next);
            onSelectChord(next.sections[next.sections.length - 1].chords[0].id);
          }}
        >
          ＋ セクションを追加
        </button>
      </div>
    );
  }
  const { chord, section } = found;
  const index = section.chords.findIndex((c) => c.id === chord.id);

  return (
    <div className="edit-panel chord-panel" role="region" aria-label="コードの編集">
      <div className="tabs small-tabs" role="tablist" aria-label="編集する対象">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chord"}
          className={tab === "chord" ? "on" : ""}
          onClick={() => setTab("chord")}
        >
          コード「{chord.chordName}」
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "section"}
          className={tab === "section" ? "on" : ""}
          onClick={() => setTab("section")}
        >
          セクション「{section.name}」
        </button>
      </div>
      {tab === "chord" ? (
        <ChordEditor
          key={chord.id}
          song={song}
          settings={settings}
          chordId={chord.id}
          label={`${section.name} の ${index + 1}番目`}
          onSongChange={onSongChange}
          onSelectChord={onSelectChord}
          onEditForm={onEditForm}
        />
      ) : (
        <SectionEditor
          key={section.id}
          song={song}
          sectionId={section.id}
          onSongChange={onSongChange}
          onSelectChord={onSelectChord}
        />
      )}
    </div>
  );
}

const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const QUALITIES: [suffix: string, label: string][] = [
  ["", "メジャー"],
  ["m", "m"],
  ["7", "7"],
  ["maj7", "maj7"],
  ["m7", "m7"],
  ["sus4", "sus4"],
  ["add9", "add9"],
  ["6", "6"],
  ["dim", "dim"],
  ["aug", "aug"],
  ["m7b5", "m7♭5"],
];

/** "F#m7/E" → { root: "F#", suffix: "m7", bass: "/E" } */
function splitName(name: string) {
  const m = /^([A-G][#♯b♭]?)([^/]*)(\/.*)?$/.exec(name.trim());
  return m ? { root: m[1], suffix: m[2], bass: m[3] ?? "" } : { root: "C", suffix: "", bass: "" };
}

function ChordEditor({
  song,
  settings,
  chordId,
  label,
  onSongChange,
  onSelectChord,
  onEditForm,
}: {
  song: Song;
  settings: DisplaySettings;
  chordId: string;
  label: string;
  onSongChange: (song: Song) => void;
  onSelectChord: (id: string) => void;
  onEditForm: () => void;
}) {
  const { chord, section } = findChord(song, chordId)!;
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);
  // 入力欄のコード名は打ち終わったら反映（途中の名前で保存フォームが外れないように）。
  // 一覧のボタンで変えたときは入力欄も追従させる。
  const [name, setName] = useState(chord.chordName);
  const [shown, setShown] = useState(chord.chordName);
  if (shown !== chord.chordName) {
    setShown(chord.chordName);
    setName(chord.chordName);
  }
  const valid = !!parseChord(name.trim());
  const rename = (n: string) => {
    if (n && n !== chord.chordName) onSongChange(pruneForms(renameChord(song, chord.id, n)));
  };
  const commitName = () => {
    const n = name.trim();
    if (n && n !== chord.chordName) rename(n);
    else setName(chord.chordName);
  };
  const parts = splitName(chord.chordName);
  const resolved = resolveForm(song, chord);
  const beats = ticksToBeats(chord.durationTicks, ts);
  const add = (position: "before" | "after") => {
    const r = insertChord(song, chord.id, position, chord.chordName, m);
    onSongChange(r.song);
    onSelectChord(r.chordId);
  };

  return (
    <div className="chord-editor-grid">
      <div className="ce-controls">
        <div className="btn-row">
          <span className="muted small">{label}</span>
          <input
            type="text"
            className={`chord-name-input big${valid ? "" : " invalid"}`}
            aria-label="コード名"
            aria-invalid={!valid}
            value={name}
            list="chord-name-options"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <datalist id="chord-name-options">
            {chordNamesInSong(song).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {!valid && <span className="warn small">解析できません（例: C, Am, G7, F#m, Bb, C/G）</span>}
        </div>

        <div className="ce-palette" role="group" aria-label="ルート">
          {ROOTS.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip${parts.root === r ? " on" : ""}`}
              aria-pressed={parts.root === r}
              onClick={() => rename(r + parts.suffix + parts.bass)}
            >
              {r.replace("#", "♯").replace("b", "♭")}
            </button>
          ))}
        </div>
        <div className="ce-palette" role="group" aria-label="種類">
          {QUALITIES.map(([suffix, text]) => (
            <button
              key={text}
              type="button"
              className={`chip${parts.suffix === suffix ? " on" : ""}`}
              aria-pressed={parts.suffix === suffix}
              onClick={() => rename(parts.root + suffix + parts.bass)}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="btn-row">
          <span className="small">長さ</span>
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
          {(
            [
              ["½小節", m / 2],
              ["1小節", m],
              ["2小節", m * 2],
            ] as const
          ).map(([text, t]) => (
            <button
              key={text}
              type="button"
              className={`chip${chord.durationTicks === t ? " on" : ""}`}
              disabled={!Number.isInteger(t)}
              onClick={() => onSongChange(setChordDuration(song, chord.id, t))}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="btn-row">
          <button type="button" className="small-btn" onClick={() => add("before")}>
            ＋ 前に追加
          </button>
          <button type="button" className="small-btn" onClick={() => add("after")}>
            ＋ 後ろに追加
          </button>
          <button
            type="button"
            className="small-btn"
            disabled={chord.durationTicks < 6}
            onClick={() => {
              // 16分（3 tick）単位で半分に分ける
              const half = Math.round(chord.durationTicks / 2 / 3) * 3;
              const r = splitChord(song, chord.id, half);
              if (r) onSongChange(r.song);
            }}
          >
            半分に分ける
          </button>
          <button
            type="button"
            className="small-btn danger"
            disabled={section.chords.length === 1}
            title={
              section.chords.length === 1
                ? "セクションの最後の1つは削除できません（セクションごと削除してください）"
                : ""
            }
            onClick={() => {
              const i = section.chords.findIndex((c) => c.id === chord.id);
              const neighbor = section.chords[i + 1] ?? section.chords[i - 1];
              onSongChange(deleteChord(song, chord.id));
              if (neighbor) onSelectChord(neighbor.id);
            }}
          >
            削除
          </button>
        </div>

        <div className="btn-row">
          <label className="field inline-field" style={{ margin: 0 }}>
            <span>リズム</span>
            <select
              aria-label="このコードのリズム"
              value={chord.rhythmPatternId ?? ""}
              onChange={(e) =>
                onSongChange(
                  updateChord(song, chord.id, (c) => ({ ...c, rhythmPatternId: e.target.value || undefined })),
                )
              }
            >
              <option value="">セクションに従う</option>
              {song.rhythmPatterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="ce-preview">
        <div className="ce-preview-head">
          <span className="ce-preview-name">{chord.chordName}</span>
          <span className="badge mono">{resolved.form ? formShorthand(resolved.form.positions) : "フォームなし"}</span>
          <span className="muted small">{resolved.source === "saved" ? "保存フォーム" : "自動生成"}</span>
          <button type="button" className="small-btn" onClick={onEditForm}>
            フォームを編集
          </button>
        </div>
        {resolved.analysis && <FormAnalysisView analysis={resolved.analysis} labelMode={settings.tabLabelMode} />}
        {resolved.form && (
          <TabView
            positions={resolved.form.positions}
            labelMode={settings.tabLabelMode}
            rootPc={resolved.analysis?.chord?.root ?? null}
          />
        )}
        {resolved.form && settings.showPiano && (
          <PianoView
            notes={soundingNotes(resolved.form.positions)}
            labelMode={settings.pianoLabelMode}
            rootPc={resolved.analysis?.chord?.root ?? null}
          />
        )}
      </div>
    </div>
  );
}

function SectionEditor({
  song,
  sectionId,
  onSongChange,
  onSelectChord,
}: {
  song: Song;
  sectionId: string;
  onSongChange: (song: Song) => void;
  onSelectChord: (id: string) => void;
}) {
  const section = song.sections.find((s) => s.id === sectionId)!;
  const index = song.sections.findIndex((s) => s.id === sectionId);
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);
  const [name, setName] = useState(section.name);
  const [text, setText] = useState(() => progressionToText(section, ts));
  const [error, setError] = useState<string | null>(null);

  const applyText = () => {
    try {
      const parsed = parseProgressionText(text, ts);
      if (parsed.length === 0) throw new Error("コードがありません");
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
      onSongChange(
        pruneForms(updateSection(song, section.id, (s) => ({ ...s, chords: applyProgression(s.chords, parsed) }))),
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="section-editor-panel">
      <div className="btn-row">
        <label className="field inline-field" style={{ margin: 0 }}>
          <span>セクション名</span>
          <input
            type="text"
            aria-label="セクション名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim();
              if (n && n !== section.name) onSongChange(updateSection(song, section.id, (s) => ({ ...s, name: n })));
              else setName(section.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <label className="field inline-field" style={{ margin: 0 }}>
          <span>リズム</span>
          <select
            aria-label="セクションのリズム"
            value={section.rhythmPatternId ?? ""}
            onChange={(e) =>
              onSongChange(
                updateSection(song, section.id, (s) => ({ ...s, rhythmPatternId: e.target.value || undefined })),
              )
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
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="small-btn"
          disabled={index === 0}
          onClick={() => onSongChange(moveSection(song, section.id, -1))}
        >
          ↑ 前へ
        </button>
        <button
          type="button"
          className="small-btn"
          disabled={index === song.sections.length - 1}
          onClick={() => onSongChange(moveSection(song, section.id, 1))}
        >
          ↓ 後ろへ
        </button>
        <button type="button" className="small-btn" onClick={() => onSongChange(duplicateSection(song, section.id))}>
          複製
        </button>
        <button
          type="button"
          className="small-btn"
          onClick={() => {
            const next = addSection(song, section.id, `セクション${song.sections.length + 1}`, m);
            onSongChange(next);
            const added = next.sections[index + 1];
            if (added) onSelectChord(added.chords[0].id);
          }}
        >
          ＋ 後ろにセクションを追加
        </button>
        <button
          type="button"
          className="small-btn danger"
          onClick={() => {
            if (!window.confirm(`セクション「${section.name}」を削除しますか？（コードと歌詞も消えます）`)) return;
            const neighbor = song.sections[index + 1] ?? song.sections[index - 1];
            onSongChange(deleteSection(song, section.id));
            if (neighbor) onSelectChord(neighbor.chords[0].id);
          }}
        >
          セクションを削除
        </button>
      </div>
      <details className="bulk">
        <summary>テキストでまとめて入力（| C | G | Am Em | の形式）</summary>
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
              今の内容を読み込む
            </button>
            <button type="button" className="small-btn primary" onClick={applyText}>
              適用
            </button>
          </div>
          <p className="muted small">
            小節を <code>|</code> で区切り、小節内のコードは等分。<code>-</code> で直前のコードを伸ばせます（例:{" "}
            <code>| C - - G |</code>）。
          </p>
          {error && <p className="warn small">⚠ {error}</p>}
        </div>
      </details>
    </div>
  );
}
