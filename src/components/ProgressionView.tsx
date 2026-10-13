import { useEffect, useRef } from "react";
import { sectionMeasureRows } from "../music/arrangement";
import { sortLyrics } from "../music/lyrics";
import type { Song } from "../model/types";

type Props = {
  song: Song;
  selectedChordId?: string;
  onSelectChord: (chordId: string) => void;
  showLyrics: boolean;
};

/** 曲全体のコード進行（セクションごと・小節ごと） */
export function ProgressionView({ song, selectedChordId, onSelectChord, showLyrics }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 選択中のコードが見える位置までスクロール（コンテナ内のみ）
  useEffect(() => {
    const container = ref.current;
    const el = container?.querySelector<HTMLElement>(".prog-chord.selected");
    if (!container || !el) return;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < c.top || r.bottom > c.bottom) {
      container.scrollTop += r.top - c.top - c.height / 3;
    }
  }, [selectedChordId]);

  let measureCounter = 0;
  return (
    <div className="progression" ref={ref}>
      {song.sections.length === 0 && <p className="muted">コードがまだありません。「編集」から追加してください。</p>}
      {song.sections.map((section) => {
        const rows = sectionMeasureRows(song, section);
        const offset = measureCounter;
        measureCounter += rows.length;
        return (
          <section key={section.id} className="prog-section" aria-label={section.name}>
            <h3 className="prog-section-name">{section.name}</h3>
            <div className="prog-measures">
              {rows.map((row) => (
                <div key={row.measureIndex} className="prog-measure">
                  <span className="prog-measure-num" aria-hidden>
                    {offset + row.measureIndex + 1}
                  </span>
                  {row.slots.map((slot) => {
                    const selected = slot.chord.id === selectedChordId;
                    const lyric = sortLyrics(slot.lyrics);
                    return (
                      <button
                        key={`${slot.chord.id}-${slot.start}`}
                        type="button"
                        className={`prog-chord${selected ? " selected" : ""}${slot.continued ? " continued" : ""}`}
                        style={{ flexGrow: slot.length }}
                        onClick={() => onSelectChord(slot.chord.id)}
                        aria-pressed={selected}
                        aria-label={`${section.name} ${slot.chord.chordName}${slot.continued ? "（前の小節から継続）" : ""}`}
                      >
                        <span className="prog-chord-name">
                          {selected && <span aria-hidden>▶ </span>}
                          {slot.continued ? (
                            <span className="cont">（{slot.chord.chordName}）</span>
                          ) : (
                            slot.chord.chordName
                          )}
                        </span>
                        {showLyrics && lyric.length > 0 && (
                          <span className="prog-lyric">
                            {lyric.map((l) => (
                              <span key={l.id} className={l.accentMarked ? "accent" : undefined}>
                                {l.text}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
