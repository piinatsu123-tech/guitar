import { useState } from "react";
import type { DisplaySettings, Song } from "../../model/types";
import { FormTab } from "./FormTab";

type Props = {
  song: Song;
  settings: DisplaySettings;
  onSave: (song: Song) => void;
  onClose: () => void;
};

/**
 * コードフォームの編集画面。編集は下書き（draft）に対して行い、「保存」で演奏画面へ反映する。
 */
export function EditScreen({ song, settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Song>(song);
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
          <h1>コードフォーム: {draft.title}</h1>
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

      <div className="tab-panel" role="tabpanel">
        <FormTab song={draft} onChange={change} settings={settings} />
      </div>
    </div>
  );
}
