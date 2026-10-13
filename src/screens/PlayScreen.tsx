import { useEffect, useMemo, useState } from "react";
import { player } from "../audio/player";
import { buildSongSchedule } from "../audio/schedule";
import { FormAnalysisView } from "../components/FormAnalysisView";
import { PianoView } from "../components/PianoView";
import { ProgressionView } from "../components/ProgressionView";
import { RhythmTimeline } from "../components/RhythmTimeline";
import { ScoreView } from "../components/ScoreView";
import { SettingsPanel } from "../components/SettingsPanel";
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
  onEdit: (tab?: string) => void;
  onBack: () => void;
};

export function PlayScreen({
  song,
  settings,
  onSettingsChange,
  selectedChordId,
  onSelectChord,
  onSongChange,
  onEdit,
  onBack,
}: Props) {
  const placed = useMemo(() => layoutSong(song), [song]);
  const current = placed.find((p) => p.chord.id === selectedChordId) ?? placed[0];
  const [range, setRange] = useState<"chord" | "section">("chord");
  const [showSettings, setShowSettings] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [metronome, setMetronome] = useState(false);

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
    onSongChange(updateChord(song, chordId, (c) => ({ ...c, lyrics: toggleAccent(c.lyrics, lyricId) })));
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
          <button type="button" className="primary" onClick={() => onEdit()}>
            編集
          </button>
        </div>
      </header>
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
