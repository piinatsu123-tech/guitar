import { useEffect, useMemo, useState } from "react";
import { player } from "../audio/player";
import { buildSongSchedule } from "../audio/schedule";
import { FormAnalysisView } from "../components/FormAnalysisView";
import { MeasureRhythmPanel, type RhythmClip } from "../components/MeasureRhythmPanel";
import { PianoView } from "../components/PianoView";
import { ProgressionView } from "../components/ProgressionView";
import { RhythmTimeline } from "../components/RhythmTimeline";
import { ScoreView } from "../components/ScoreView";
import { SettingsPanel } from "../components/SettingsPanel";
import { SongInfoForm } from "../components/SongInfoForm";
import { ChordPanel } from "./play/ChordPanel";
import { LyricsPanel } from "./play/LyricsPanel";
import { TabView } from "../components/TabView";
import { sectionMeasureRows } from "../music/arrangement";
import { formShorthand, soundingNotes } from "../music/chord";
import { toggleAccent } from "../music/lyrics";
import { layoutSong, resolveRhythmPattern } from "../music/timeline";
import { resolveForm, updateChord } from "../model/songOps";
import type { DisplaySettings, Song } from "../model/types";

type Props = {
  song: Song;
  settings: DisplaySettings;
  onSettingsChange: (s: DisplaySettings) => void;
  selectedChordId?: string;
  onSelectChord: (id: string) => void;
  /** 歌詞のマークなど、演奏画面からの即時保存 */
  onSongChange: (song: Song) => void;
  /** コードフォーム・リズムパターンの編集画面を開く */
  onEdit: (tab?: string) => void;
  onBack: () => void;
  /** 開いたときの編集モード（新しい曲を作ったときなど） */
  initialEditMode?: EditMode;
  initialSongInfo?: boolean;
};

export type EditMode = "view" | "chord" | "rhythm" | "lyrics";

const EDIT_MODES: [EditMode, string][] = [
  ["view", "見る"],
  ["chord", "コード"],
  ["rhythm", "リズム"],
  ["lyrics", "歌詞"],
];

export function PlayScreen({
  song,
  settings,
  onSettingsChange,
  selectedChordId,
  onSelectChord,
  onSongChange,
  onEdit,
  onBack,
  initialEditMode = "view",
  initialSongInfo = false,
}: Props) {
  const placed = useMemo(() => layoutSong(song), [song]);
  const current = placed.find((p) => p.chord.id === selectedChordId) ?? placed[0];
  const [range, setRange] = useState<"chord" | "section">("chord");
  const [showSettings, setShowSettings] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [metronome, setMetronome] = useState(false);
  // 譜面での編集モード（見る／コード／リズム／歌詞）
  const [editMode, setEditMode] = useState<EditMode>(initialEditMode);
  const [showSongInfo, setShowSongInfo] = useState(initialSongInfo);
  const rhythmEdit = editMode === "rhythm";
  // 編集の履歴（画面全体で共通の「元に戻す／やり直す」）
  const [past, setPast] = useState<Song[]>([]);
  const [future, setFuture] = useState<Song[]>([]);
  const commit = (next: Song) => {
    setPast((p) => [...p.slice(-49), song]);
    setFuture([]);
    onSongChange(next);
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [song, ...f]);
    onSongChange(prev);
  };
  const redo = () => {
    const nextSong = future[0];
    if (!nextSong) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, song]);
    onSongChange(nextSong);
  };
  const changeMode = (mode: EditMode) => {
    setEditMode(mode);
    setMeasureSel(null);
    // 編集は譜面で行う
    if (mode !== "view" && settings.playView !== "score") onSettingsChange({ ...settings, playView: "score" });
  };
  const [measureSel, setMeasureSel] = useState<{ anchor: number; end: number } | null>(null);
  const [clip, setClip] = useState<RhythmClip | null>(null);
  const onMeasureClick = (g: number) => {
    setMeasureSel((sel) => {
      if (!sel) return { anchor: g, end: g };
      if (sel.anchor === sel.end && sel.anchor === g) return null; // 同じ小節をもう一度：解除
      if (sel.anchor === sel.end) return { anchor: sel.anchor, end: g }; // 2つ目：範囲
      return { anchor: g, end: g }; // 範囲を選んだあと：選び直し
    });
  };
  const selRange = measureSel
    ? { from: Math.min(measureSel.anchor, measureSel.end), to: Math.max(measureSel.anchor, measureSel.end) }
    : null;

  // 画面を離れたら再生を止める
  useEffect(() => () => player.stop(), []);

  // 選択中のコードから曲の最後まで再生する（選択は再生に追従）
  const togglePlay = async () => {
    if (player.playing) {
      player.stop();
      return;
    }
    if (!current) return;
    setPlaying(true);
    await player.play(buildSongSchedule(song, current.globalIndex, { metronome }), {
      owner: "song",
      onChord: onSelectChord,
      onEnd: () => setPlaying(false),
    });
  };

  // 選択が無効になった場合は先頭を選ぶ
  useEffect(() => {
    if (current && current.chord.id !== selectedChordId) onSelectChord(current.chord.id);
  }, [current, selectedChordId, onSelectChord]);

  const move = (delta: number) => {
    if (!current) return;
    const next = placed[current.globalIndex + delta];
    if (next) onSelectChord(next.chord.id);
  };

  // PC ではキーボードの ← → でコード移動
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // タップ録音などが使ったキー
      if (player.owner === "recording") return; // タップ録音中は再生・移動を受け付けない
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === " " && !(t && t.tagName === "BUTTON")) {
        e.preventDefault();
        void togglePlay();
      }
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const resolved = current ? resolveForm(song, current.chord) : null;
  const notes = resolved?.form ? soundingNotes(resolved.form.positions) : [];
  const rootPc = resolved?.analysis?.chord?.root ?? null;
  const pattern = current ? resolveRhythmPattern(song, current.section, current.chord) : undefined;

  const rows = useMemo(() => {
    if (!current) return [];
    const all = sectionMeasureRows(song, current.section);
    if (range === "section") return all;
    return all.filter((r) => r.slots.some((s) => s.chord.id === current.chord.id));
  }, [song, current, range]);

  const measureOffset = useMemo(() => {
    if (!current) return 0;
    let n = 0;
    for (const s of song.sections) {
      if (s.id === current.section.id) break;
      n += sectionMeasureRows(song, s).length;
    }
    return n;
  }, [song, current]);

  const toggleLyricAccent = (chordId: string, lyricId: string) => {
    commit(updateChord(song, chordId, (c) => ({ ...c, lyrics: toggleAccent(c.lyrics, lyricId) })));
  };

  const prev = current ? placed[current.globalIndex - 1] : undefined;
  const next = current ? placed[current.globalIndex + 1] : undefined;

  return (
    <div className="play-screen">
      <header className="song-header">
        <button type="button" className="ghost" onClick={onBack} aria-label="曲一覧へ戻る">
          ‹ 曲一覧
        </button>
        <div className="song-title-block">
          <h1>{song.title}</h1>
          <div className="song-meta">
            <span>♩ = {song.tempo}</span>
            <span>
              {song.timeSignature.numerator}/{song.timeSignature.denominator}拍子
            </span>
          </div>
        </div>
        <div className="header-actions">
          <div className="segmented" role="radiogroup" aria-label="表示形式">
            {(
              [
                ["score", "譜面"],
                ["detail", "コード詳細"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.playView === v}
                className={settings.playView === v ? "on" : ""}
                onClick={() => onSettingsChange({ ...settings, playView: v })}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`ghost${showSettings ? " active" : ""}`}
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
          >
            表示設定
          </button>
          <button type="button" className="ghost" onClick={() => onEdit("forms")}>
            フォーム・パターン
          </button>
        </div>
      </header>

      <div className="edit-toolbar" role="toolbar" aria-label="編集">
        <div className="segmented" role="radiogroup" aria-label="編集モード">
          {EDIT_MODES.map(([mode, text]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={editMode === mode}
              className={editMode === mode ? "on" : ""}
              onClick={() => changeMode(mode)}
            >
              {mode === "view" ? text : `✎ ${text}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`small-btn${showSongInfo ? " active" : ""}`}
          aria-expanded={showSongInfo}
          onClick={() => setShowSongInfo((v) => !v)}
        >
          曲情報
        </button>
        <button type="button" className="small-btn" onClick={undo} disabled={past.length === 0} aria-label="元に戻す">
          ↶ 元に戻す
        </button>
        <button type="button" className="small-btn" onClick={redo} disabled={future.length === 0} aria-label="やり直す">
          ↷ やり直す
        </button>
        {editMode !== "view" && (
          <span className="muted small">
            {editMode === "chord" && "コードをタップして編集"}
            {editMode === "rhythm" && "小節をタップして選択"}
            {editMode === "lyrics" && "コードをタップして歌詞を編集"}
            ・変更はすぐ保存されます
          </span>
        )}
      </div>
      {showSongInfo && (
        <div className="card">
          <SongInfoForm song={song} onChange={commit} />
        </div>
      )}
      {(showSettings || settings.playView === "score") && (
        <SettingsPanel settings={settings} onChange={onSettingsChange} compact togglesOnly={!showSettings} />
      )}

      {settings.playView === "score" ? (
        <ScoreView
          song={song}
          settings={settings}
          selectedChordId={current?.chord.id}
          onSelectChord={onSelectChord}
          onToggleAccent={toggleLyricAccent}
          rhythmEdit={selRange}
          onMeasureClick={rhythmEdit ? onMeasureClick : undefined}
        />
      ) : (
        <div className="play-layout">
          <div className="play-progression card">
            <h2 className="card-title">コード進行</h2>
            <ProgressionView
              song={song}
              selectedChordId={current?.chord.id}
              onSelectChord={onSelectChord}
              showLyrics={settings.showLyrics}
            />
          </div>

          <div className="play-detail">
            {current ? (
              <>
                <div className="card current-chord" aria-live="polite">
                  <div className="current-chord-head">
                    <div>
                      <span className="muted small">{current.section.name}</span>
                      <h2 className="current-chord-name">{current.chord.chordName}</h2>
                    </div>
                    <div className="current-chord-info">
                      {resolved?.form && (
                        <span className="badge" title="6弦→1弦">
                          {formShorthand(resolved.form.positions)}
                        </span>
                      )}
                      <span className={`badge ${resolved?.source === "saved" ? "saved" : "auto"}`}>
                        {resolved?.source === "saved"
                          ? "保存フォーム"
                          : resolved?.source === "auto"
                            ? "自動生成"
                            : "フォームなし"}
                      </span>
                      <button type="button" className="small-btn" onClick={() => onEdit("forms")}>
                        フォーム編集
                      </button>
                    </div>
                  </div>
                  {resolved?.analysis && (
                    <FormAnalysisView analysis={resolved.analysis} labelMode={settings.tabLabelMode} />
                  )}
                  {!resolved?.form && (
                    <p className="muted">このコード名からフォームを生成できません。編集画面で手動入力してください。</p>
                  )}
                  {resolved?.form && settings.showTab && (
                    <div className="view-block">
                      <h3 className="block-title">ギター（TAB譜・指板）</h3>
                      <TabView positions={resolved.form.positions} labelMode={settings.tabLabelMode} rootPc={rootPc} />
                    </div>
                  )}
                  {resolved?.form && settings.showPiano && (
                    <div className="view-block">
                      <h3 className="block-title">ピアノ鍵盤（実音）</h3>
                      <PianoView notes={notes} labelMode={settings.pianoLabelMode} rootPc={rootPc} />
                    </div>
                  )}
                </div>

                {(settings.showRhythm || settings.showStrokes || settings.showLyrics) && (
                  <div className="card">
                    <div className="card-title-row">
                      <h2 className="card-title">
                        {settings.showRhythm ? "リズム" : ""}
                        {settings.showRhythm && settings.showLyrics ? "と" : ""}
                        {settings.showLyrics ? "歌詞" : ""}
                      </h2>
                      <div className="segmented small" role="radiogroup" aria-label="表示範囲">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={range === "chord"}
                          className={range === "chord" ? "on" : ""}
                          onClick={() => setRange("chord")}
                        >
                          このコード
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={range === "section"}
                          className={range === "section" ? "on" : ""}
                          onClick={() => setRange("section")}
                        >
                          セクション全体
                        </button>
                      </div>
                    </div>
                    {settings.showRhythm && (
                      <p className="muted small">
                        パターン: {pattern?.name ?? "未設定"}
                        {pattern && current.chord.rhythmPatternId
                          ? "（コード個別）"
                          : pattern && current.section.rhythmPatternId
                            ? "（セクション）"
                            : pattern
                              ? "（曲の既定）"
                              : ""}
                      </p>
                    )}
                    <RhythmTimeline
                      rows={rows}
                      timeSignature={song.timeSignature}
                      selectedChordId={current.chord.id}
                      onSelectChord={onSelectChord}
                      onToggleAccent={toggleLyricAccent}
                      display={{
                        variant: "detail",
                        showDiagram: false,
                        showPiano: false,
                        showLyrics: settings.showLyrics,
                        showRhythm: settings.showRhythm,
                        showStrokes: settings.showStrokes,
                        tabLabelMode: settings.tabLabelMode,
                        pianoLabelMode: settings.pianoLabelMode,
                      }}
                      measureNumberOffset={measureOffset}
                    />
                    {settings.showLyrics && (
                      <p className="muted small">
                        歌詞の文字をタップすると「この位置で弾く」マークを付け外しできます。
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="card">
                <p className="muted">コードがありません。</p>
              </div>
            )}
          </div>
        </div>
      )}

      {rhythmEdit && settings.playView === "score" && !selRange && (
        <div className="measure-panel hint" role="status">
          リズムを入れたい小節をタップしてください。続けて別の小節をタップすると、その間をまとめて選べます。
        </div>
      )}
      {rhythmEdit && settings.playView === "score" && selRange && (
        <MeasureRhythmPanel
          song={song}
          from={selRange.from}
          to={selRange.to}
          onSongChange={commit}
          onUndo={undo}
          clip={clip}
          onCopy={setClip}
          onClose={() => setMeasureSel(null)}
        />
      )}
      {editMode === "chord" && settings.playView === "score" && (
        <ChordPanel
          song={song}
          settings={settings}
          chordId={current?.chord.id}
          onSongChange={commit}
          onSelectChord={onSelectChord}
          onEditForm={() => onEdit("forms")}
        />
      )}
      {editMode === "lyrics" && settings.playView === "score" && (
        <LyricsPanel song={song} chordId={current?.chord.id} onSongChange={commit} />
      )}

      <nav className="chord-nav" aria-label="コード移動">
        <button type="button" onClick={() => move(-1)} disabled={!prev}>
          ◀ 前 <span className="nav-chord">{prev?.chord.chordName ?? ""}</span>
        </button>
        <div className="nav-center">
          <button
            type="button"
            className={`play-btn${playing ? " playing" : ""}`}
            onClick={() => void togglePlay()}
            aria-pressed={playing}
            disabled={!current}
          >
            {playing ? "■ 停止" : "▶ 再生"}
          </button>
          <label className={`toggle small-toggle${metronome ? " on" : ""}`}>
            <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} />
            <span aria-hidden className="toggle-mark">
              {metronome ? "✓" : ""}
            </span>
            メトロノーム
          </label>
          <span className="nav-current">
            {current ? `${current.globalIndex + 1} / ${placed.length}` : ""}・♩={song.tempo}
          </span>
        </div>
        <button type="button" onClick={() => move(1)} disabled={!next}>
          <span className="nav-chord">{next?.chord.chordName ?? ""}</span> 次 ▶
        </button>
      </nav>
    </div>
  );
}
