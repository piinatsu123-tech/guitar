import { useState } from "react";
import type { DisplaySettings, Song } from "../../model/types";
import { FormTab } from "./FormTab";
import { RhythmTab } from "./RhythmTab";

// 曲情報・コード進行・歌詞・小節のリズムは、演奏画面の譜面で直接編集する。
// この画面は「部品」の登録だけ：コードフォームとリズムパターン。
export type EditTab = "forms" | "rhythm";

const TABS: { id: EditTab; label: string }[] = [
  { id: "forms", label: "コードフォーム" },
  { id: "rhythm", label: "リズムパターン" },
];

type Props = {
  song: Song;
  initialTab?: EditTab;
  focusChordId?: string;
  settings: DisplaySettings;
  onSave: (song: Song) => void;
  onClose: () => void;
};

/**
 * 編集画面。編集は下書き（draft）に対して行い、「保存」で演奏画面へ反映する。
 * 表示設定だけは即時反映・即時保存する。
 */
export function EditScreen({ song, initialTab = "forms", focusChordId, settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Song>(song);
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [dirty, setDirty] = useState(false);

  const change = (next: Song) => {
    setDraft(next);
    setDirty(true);
  };

  const save = () => {
    onSave(draft);
    setDirty(false);
  };

  const close = () => {
    if (dirty && !window.confirm("保存していない変更があります。破棄して戻りますか？")) return;
    onClose();
  };

  return (
    <div className="edit-screen">
      <header className="song-header edit-header">
        <button type="button" className="ghost" onClick={close}>
          ‹ 演奏画面
        </button>
        <div className="song-title-block">
          <h1>フォーム・パターン: {draft.title}</h1>
          <div className="song-meta">
            {dirty ? <span className="unsaved">● 未保存の変更があります</span> : <span>保存済み</span>}
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="ghost"
            disabled={!dirty}
            onClick={() => {
              if (window.confirm("保存していない変更を破棄しますか？")) {
                setDraft(song);
                setDirty(false);
              }
            }}
          >
            破棄
          </button>
          <button type="button" className="primary" onClick={save} disabled={!dirty}>
            保存
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="編集項目">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel">
        {tab === "forms" && <FormTab song={draft} onChange={change} settings={settings} focusChordId={focusChordId} />}
        {tab === "rhythm" && <RhythmTab song={draft} onChange={change} />}
      </div>
    </div>
  );
}
