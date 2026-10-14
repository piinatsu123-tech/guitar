import { useEffect, useMemo, useState } from "react";
import { FormAnalysisView } from "../../components/FormAnalysisView";
import { PianoView } from "../../components/PianoView";
import { TabView } from "../../components/TabView";
import { formShorthand, fretsFromPositions, soundingNotes } from "../../music/chord";
import { generateForms } from "../../music/formGenerator";
import { clearForm, findChord, resolveForm, saveForm } from "../../model/songOps";
import type { DisplaySettings, Song } from "../../model/types";

type Props = {
  song: Song;
  chordId: string;
  settings: DisplaySettings;
  onSongChange: (song: Song) => void;
  /** 細かく編集する（コードフォームの画面へ） */
  onEditForms: () => void;
  onClose: () => void;
};

/**
 * コードの拡大表示。大きなコード図・鍵盤・構成音を見せ、押さえ方（フォーム）をその場で選び直せる。
 * 選んだフォームはすぐ保存する（既定は曲の中の同じコードすべて）。
 */
export function ChordDetailDialog({ song, chordId, settings, onSongChange, onEditForms, onClose }: Props) {
  const found = findChord(song, chordId);
  const [applyToAll, setApplyToAll] = useState(true);
  const chordName = found?.chord.chordName ?? "";
  const candidates = useMemo(() => generateForms(chordName, { maxResults: 8 }), [chordName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!found) return null;
  const resolved = resolveForm(song, found.chord);
  const form = resolved.form;
  const rootPc = resolved.analysis?.chord?.root ?? null;
  const current = form ? fretsFromPositions(form.positions).join(",") : "";
  const count = song.sections.reduce((a, s) => a + s.chords.filter((c) => c.chordName === chordName).length, 0);

  const choose = (frets: (number | null)[]) => {
    const r = saveForm(
      song,
      { id: resolved.source === "saved" ? form?.id : undefined, chordName, frets },
      { chordId, applyToAll },
    );
    onSongChange(r.song);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="chord-dialog card"
        role="dialog"
        aria-modal="true"
        aria-label={`コード ${chordName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chord-dialog-head">
          <h2 className="chord-dialog-name">{chordName}</h2>
          {form && <span className="badge mono">{formShorthand(form.positions)}</span>}
          <span className={`badge ${resolved.source === "saved" ? "saved" : "auto"}`}>
            {resolved.source === "saved" ? "選んだフォーム" : "自動で選んだフォーム"}
          </span>
          <span className="spacer" />
          <button type="button" className="small-btn" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </div>
        {resolved.analysis && <FormAnalysisView analysis={resolved.analysis} labelMode={settings.tabLabelMode} />}
        {form ? (
          <div className="chord-dialog-views">
            <TabView positions={form.positions} labelMode={settings.tabLabelMode} rootPc={rootPc} />
            <PianoView notes={soundingNotes(form.positions)} labelMode={settings.pianoLabelMode} rootPc={rootPc} />
          </div>
        ) : (
          <p className="warn small">このコードのフォームを作れませんでした。</p>
        )}

        {candidates.length > 0 && (
          <>
            <div className="btn-row">
              <strong className="small">ほかの押さえ方</strong>
              <div className="segmented small" role="radiogroup" aria-label="変える範囲">
                <button
                  type="button"
                  role="radio"
                  aria-checked={applyToAll}
                  className={applyToAll ? "on" : ""}
                  onClick={() => setApplyToAll(true)}
                >
                  この曲の「{chordName}」すべて（{count}か所）
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!applyToAll}
                  className={!applyToAll ? "on" : ""}
                  onClick={() => setApplyToAll(false)}
                >
                  ここだけ
                </button>
              </div>
            </div>
            <div className="candidates">
              {candidates.map((g, i) => {
                const active = g.frets.join(",") === current;
                return (
                  <button
                    key={g.frets.join(",")}
                    type="button"
                    className={`candidate${active ? " on" : ""}`}
                    aria-pressed={active}
                    aria-label={`候補${i + 1} ${formShorthand(g.positions)}`}
                    onClick={() => choose(g.frets)}
                  >
                    <span className="candidate-head">
                      <span className="mono">{formShorthand(g.positions)}</span>
                      {active && <span>✓</span>}
                    </span>
                    <TabView positions={g.positions} labelMode={settings.tabLabelMode} rootPc={rootPc} compact />
                    <span className="muted small">
                      {g.barre ? `セーハ${g.barre}F・` : ""}指{g.fingers}本
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="btn-row end">
          {resolved.source === "saved" && (
            <button
              type="button"
              className="small-btn"
              onClick={() => onSongChange(clearForm(song, chordName, chordId, applyToAll))}
            >
              自動で選ぶ形に戻す
            </button>
          )}
          <button type="button" className="small-btn" onClick={onEditForms}>
            指板・鍵盤で細かく編集
          </button>
        </div>
      </div>
    </div>
  );
}
