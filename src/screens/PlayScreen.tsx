import { useEffect, useState } from "react";
import { player } from "../audio/player";
import { SongInfoForm } from "../components/SongInfoForm";
import { LyricSheet } from "./play/LyricSheet";
import type { DisplaySettings, NoteLabelMode, Song } from "../model/types";

type Props = {
  song: Song;
  settings: DisplaySettings;
  onSettingsChange: (s: DisplaySettings) => void;
  /** 変更はすぐ保存する */
  onSongChange: (song: Song) => void;
  /** コードフォームの編集画面を開く */
  onEditForms: () => void;
  onBack: () => void;
  /** 開いたときに編集中にする（新しい曲を作ったとき） */
  startEditing?: boolean;
};

const LABEL_MODES: [NoteLabelMode, string][] = [
  ["solfege", "ドレミ"],
  ["abc", "ABC"],
  ["hidden", "なし"],
];

/**
 * 演奏画面：歌詞の上にコード（名前と押さえ方）を出す。各セクションにはリズム譜を置ける。
 * 「✎ 編集」で、文字をタップしてコードを置く・歌詞を直す・リズムを採譜する。
 */
export function PlayScreen({
  song,
  settings,
  onSettingsChange,
  onSongChange,
  onEditForms,
  onBack,
  startEditing = false,
}: Props) {
  const [editing, setEditing] = useState(startEditing);
  const [showSongInfo, setShowSongInfo] = useState(startEditing);
  const [showDisplay, setShowDisplay] = useState(false);
  // 編集の履歴（「元に戻す／やり直す」）
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

  // 画面を離れたら音を止める
  useEffect(() => () => player.stop(), []);

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
          <button
            type="button"
            className={editing ? "primary" : "ghost"}
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "✓ 編集を終える" : "✎ 編集"}
          </button>
          <button
            type="button"
            className={`ghost${showDisplay ? " active" : ""}`}
            aria-expanded={showDisplay}
            onClick={() => setShowDisplay((v) => !v)}
          >
            表示
          </button>
          <button type="button" className="ghost" onClick={onEditForms}>
            コードフォーム
          </button>
        </div>
      </header>

      {editing && (
        <div className="edit-toolbar" role="toolbar" aria-label="編集">
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
          <button
            type="button"
            className="small-btn"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="やり直す"
          >
            ↷ やり直す
          </button>
          <span className="muted small">変更はすぐ保存されます</span>
        </div>
      )}
      {editing && showSongInfo && <SongInfoForm song={song} onChange={commit} />}
      {showDisplay && (
        <div className="card display-options" role="group" aria-label="表示">
          <label className="toggle-inline">
            <input
              type="checkbox"
              checked={settings.showTab}
              onChange={(e) => onSettingsChange({ ...settings, showTab: e.target.checked })}
            />
            コード図
          </label>
          <span className="small">コード図の音名</span>
          <div className="segmented" role="radiogroup" aria-label="コード図の音名">
            {LABEL_MODES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.tabLabelMode === v}
                className={settings.tabLabelMode === v ? "on" : ""}
                onClick={() => onSettingsChange({ ...settings, tabLabelMode: v })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="toggle-inline">
            <input
              type="checkbox"
              checked={settings.showPiano}
              onChange={(e) => onSettingsChange({ ...settings, showPiano: e.target.checked })}
            />
            ピアノ
          </label>
          <span className="small">ピアノの音名</span>
          <div className="segmented" role="radiogroup" aria-label="ピアノの音名">
            {LABEL_MODES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.pianoLabelMode === v}
                className={settings.pianoLabelMode === v ? "on" : ""}
                onClick={() => onSettingsChange({ ...settings, pianoLabelMode: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <LyricSheet
        song={song}
        settings={settings}
        onSongChange={commit}
        editing={editing}
        startWithPaste={startEditing && song.sections.length === 0}
      />
    </div>
  );
}
