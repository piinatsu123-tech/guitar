import { useMemo, useState } from "react";
import { FormAnalysisView } from "../../components/FormAnalysisView";
import { NumberInput } from "../../components/NumberInput";
import { PianoView } from "../../components/PianoView";
import { displayStartFret, TabView } from "../../components/TabView";
import {
  analyzeForm,
  formShorthand,
  fretsFromPositions,
  parseChord,
  positionsFromFrets,
  soundingNotes,
} from "../../music/chord";
import { placementsOf, toggleNoteInForm } from "../../music/formEdit";
import { DEFAULT_GENERATE_OPTIONS, generateForms, type GenerateOptions } from "../../music/formGenerator";
import type { StringNumber } from "../../music/pitch";
import { chordNamesInSong, clearForm, findChord, resolveForm, saveForm } from "../../model/songOps";
import { NO_CHORD } from "../../model/lyricSheet";
import type { DisplaySettings, Song } from "../../model/types";

/** 鍵盤で編集するときの表示範囲：C2〜B5（ギターの最低音 E2 から 1弦20フレット付近まで） */
const PIANO_EDIT_RANGE = { low: 36, high: 83 };

type Props = {
  song: Song;
  onChange: (s: Song) => void;
  settings: DisplaySettings;
  focusChordId?: string;
};

export function FormTab({ song, onChange, settings, focusChordId }: Props) {
  const names = chordNamesInSong(song).filter((n) => n !== NO_CHORD);
  const focus = findChord(song, focusChordId);
  const [chordName, setChordName] = useState<string>(focus?.chord.chordName ?? names[0] ?? "C");
  const [target, setTarget] = useState<string>("all"); // "all" またはコード ID

  const occurrences = song.sections.flatMap((s) =>
    s.chords.map((c, i) => ({ section: s, chord: c, index: i })).filter((o) => o.chord.chordName === chordName),
  );

  return (
    <div className="form-editor">
      <div className="card">
        <h2 className="card-title">コードを選ぶ</h2>
        <div className="chip-row" role="radiogroup" aria-label="コード名">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === chordName}
              className={`chip big${n === chordName ? " on" : ""}`}
              onClick={() => {
                setChordName(n);
                setTarget("all");
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {names.length === 0 && <p className="muted">曲にコードがありません。</p>}
        {occurrences.length > 0 && (
          <label className="field inline-field">
            <span>適用先</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all">
                この曲の「{chordName}」すべて（{occurrences.length}箇所）
              </option>
              {occurrences.map((o) => (
                <option key={o.chord.id} value={o.chord.id}>
                  {o.section.name} の {o.index + 1}番目のみ
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {occurrences.length > 0 && (
        <FormWorkbench
          key={`${chordName}-${target}`}
          song={song}
          chordName={chordName}
          targetChordId={target === "all" ? occurrences[0].chord.id : target}
          applyToAll={target === "all"}
          onChange={onChange}
          settings={settings}
        />
      )}
    </div>
  );
}

function FormWorkbench({
  song,
  chordName,
  targetChordId,
  applyToAll,
  onChange,
  settings,
}: {
  song: Song;
  chordName: string;
  targetChordId: string;
  applyToAll: boolean;
  onChange: (s: Song) => void;
  settings: DisplaySettings;
}) {
  const target = findChord(song, targetChordId)!;
  const resolved = resolveForm(song, target.chord);
  const [frets, setFrets] = useState<(number | null)[]>(() =>
    resolved.form ? fretsFromPositions(resolved.form.positions) : [null, null, null, null, null, null],
  );
  const [editingId, setEditingId] = useState<string | undefined>(
    resolved.source === "saved" ? resolved.form?.id : undefined,
  );
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_GENERATE_OPTIONS);
  const [generated, setGenerated] = useState(() => generateForms(chordName, DEFAULT_GENERATE_OPTIONS));
  const [viewStart, setViewStart] = useState<number>(() => displayStartFret(positionsFromFrets(frets), 7));
  const [message, setMessage] = useState<string | null>(null);

  const positions = useMemo(() => positionsFromFrets(frets), [frets]);
  const analysis = analyzeForm(chordName, positions);
  const chord = parseChord(chordName);
  const rootPc = chord?.root ?? null;
  const savedFrets = resolved.form ? fretsFromPositions(resolved.form.positions) : null;
  const changed = !savedFrets || savedFrets.join(",") !== frets.join(",") || resolved.source !== "saved";

  const setString = (s: StringNumber, fret: number | null) => {
    setFrets((prev) => prev.map((f, i) => (6 - i === s ? fret : f)));
    setMessage(null);
  };
  const cellClick = (s: StringNumber, f: number) => {
    const cur = frets[6 - s];
    setString(s, cur === f ? null : f); // 同じ位置を再タップでミュート
  };
  const openClick = (s: StringNumber) => {
    const cur = frets[6 - s];
    setString(s, cur === 0 ? null : 0); // 開放 ⇄ ミュート
  };

  const pianoClick = (midi: number) => {
    const next = toggleNoteInForm(frets, midi);
    if (!next) return;
    setFrets(next);
    setMessage(null);
    // 新しく押さえた位置が表示範囲の外なら、見える位置へ動かす
    const pressed = next.filter((f): f is number => f !== null && f > 0);
    if (pressed.some((f) => f < viewStart || f > viewStart + 6))
      setViewStart(displayStartFret(positionsFromFrets(next), 7));
  };

  const save = () => {
    if (
      !analysis.valid &&
      !window.confirm(`このフォームは「${chordName}」として成立していない可能性があります。保存しますか？`)
    )
      return;
    const result = saveForm(song, { id: editingId, chordName, frets }, { chordId: targetChordId, applyToAll });
    setEditingId(result.formId);
    onChange(result.song);
    setMessage(
      `保存しました（${applyToAll ? `「${chordName}」すべて` : "選択したコードのみ"}）。曲の「保存」で演奏画面に反映されます。`,
    );
  };

  return (
    <>
      <div className="card">
        <div className="card-title-row">
          <h2 className="card-title">
            {chordName} のフォーム
            <span className={`badge ${resolved.source === "saved" ? "saved" : "auto"}`}>
              現在: {resolved.source === "saved" ? "保存フォーム" : "自動生成"}
            </span>
          </h2>
          <span className="badge mono">{formShorthand(positions)}</span>
        </div>
        <FormAnalysisView analysis={analysis} labelMode={settings.tabLabelMode} />
        <p className="muted small">
          指板のマスをタップして押さえる位置を指定します（同じマスを再タップでミュート）。左端の欄は開放 ○ ⇄ ミュート ×
          の切替です。
        </p>
        <div className="fret-window">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewStart((v) => Math.max(1, v - 1))}
            disabled={viewStart <= 1}
            aria-label="低いフレットへ"
          >
            ◀
          </button>
          <span className="small">
            {viewStart}〜{viewStart + 6} フレットを表示
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewStart((v) => Math.min(18, v + 1))}
            aria-label="高いフレットへ"
          >
            ▶
          </button>
        </div>
        <TabView
          positions={positions}
          labelMode={settings.tabLabelMode}
          rootPc={rootPc}
          fretCount={7}
          startFret={viewStart}
          onCellClick={cellClick}
          onOpenColumnClick={openClick}
        />
        <div className="string-inputs">
          {([1, 2, 3, 4, 5, 6] as StringNumber[]).map((s) => {
            const f = frets[6 - s];
            return (
              <label key={s} className="string-input">
                <span>{s}弦</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`${s}弦のフレット（x でミュート）`}
                  value={f === null ? "x" : String(f)}
                  onChange={(e) => {
                    const v = e.target.value.trim().toLowerCase();
                    if (v === "" || v === "x" || v === "×") return setString(s, null);
                    const n = Number(v);
                    if (Number.isInteger(n) && n >= 0 && n <= 24) setString(s, n);
                  }}
                />
              </label>
            );
          })}
        </div>
        <p className="muted small">
          鍵盤をタップしても編集できます。鳴っていない音をタップすると押さえやすい弦・フレットに加わり、鳴っている音をタップするとその弦がミュートになります。
        </p>
        <PianoView
          notes={soundingNotes(positions)}
          labelMode={settings.pianoLabelMode}
          rootPc={rootPc}
          range={PIANO_EDIT_RANGE}
          isPlayable={(m) => placementsOf(m).length > 0}
          onKeyClick={pianoClick}
        />
        <div className="btn-row end">
          {resolved.source === "saved" && (
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                onChange(clearForm(song, chordName, targetChordId, applyToAll));
                setEditingId(undefined);
                setMessage("自動生成に戻しました。");
              }}
            >
              自動生成に戻す
            </button>
          )}
          <button type="button" className="primary" onClick={save} disabled={!changed}>
            このフォームを使う
          </button>
        </div>
        {message && <p className="ok small">{message}</p>}
      </div>

      <div className="card">
        <h2 className="card-title">自動生成の候補</h2>
        <div className="gen-options">
          <label className="field inline-field">
            <span>フレット範囲</span>
            <NumberInput
              integer
              min={0}
              max={20}
              value={opts.minFret}
              aria-label="最小フレット"
              className="narrow"
              onCommit={(minFret) => setOpts({ ...opts, minFret })}
            />
            〜
            <NumberInput
              integer
              min={0}
              max={24}
              value={opts.maxFret}
              aria-label="最大フレット"
              className="narrow"
              onCommit={(maxFret) => setOpts({ ...opts, maxFret })}
            />
          </label>
          <label className="toggle-inline">
            <input
              type="checkbox"
              checked={opts.allowOpen}
              onChange={(e) => setOpts({ ...opts, allowOpen: e.target.checked })}
            />
            開放弦を使う
          </label>
          <label className="field inline-field">
            <span>候補数</span>
            <NumberInput
              integer
              min={1}
              max={20}
              value={opts.maxResults}
              aria-label="候補数"
              className="narrow"
              onCommit={(maxResults) => setOpts({ ...opts, maxResults })}
            />
          </label>
          <button
            type="button"
            className="small-btn primary"
            onClick={() => setGenerated(generateForms(chordName, opts))}
          >
            候補を生成
          </button>
        </div>
        {!chord && (
          <p className="warn small">コード名を解析できないため、自動生成できません。手動で入力してください。</p>
        )}
        {chord && generated.length === 0 && <p className="muted">条件に合う候補がありません。範囲を広げてください。</p>}
        <div className="candidates">
          {generated.map((g, i) => {
            const active = g.frets.join(",") === frets.join(",");
            return (
              <button
                key={g.frets.join(",")}
                type="button"
                className={`candidate${active ? " on" : ""}`}
                onClick={() => {
                  setFrets(g.frets);
                  setViewStart(displayStartFret(g.positions, 7));
                  setMessage("候補を読み込みました。必要なら修正して「このフォームを使う」を押してください。");
                }}
                aria-pressed={active}
                aria-label={`候補${i + 1} ${formShorthand(g.positions)}`}
              >
                <span className="candidate-head">
                  <span>候補{i + 1}</span>
                  <span className="mono">{formShorthand(g.positions)}</span>
                </span>
                <TabView positions={g.positions} labelMode={settings.tabLabelMode} rootPc={rootPc} compact />
                <span className="muted small">
                  {g.barre ? `セーハ${g.barre}F・` : ""}指{g.fingers}本
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
