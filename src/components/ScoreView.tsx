import { useEffect, useMemo, useRef } from "react";
import { sectionMeasureRows } from "../music/arrangement";
import { resolveForm } from "../model/songOps";
import type { ChordEvent, DisplaySettings, Song } from "../model/types";
import { RhythmTimeline, type ChordVisual } from "./RhythmTimeline";

type Props = {
  song: Song;
  settings: DisplaySettings;
  selectedChordId?: string;
  onSelectChord: (id: string) => void;
  onToggleAccent: (chordId: string, lyricId: string) => void;
  /** リズム編集：選択中の小節（曲全体の通し番号、両端を含む）と小節タップ */
  rhythmEdit?: { from: number; to: number } | null | undefined;
  onMeasureClick?: (globalIndex: number) => void;
};

/**
 * 譜面表示（U-FRET 風）。曲全体を小節ごとに並べ、各小節でコード図・鍵盤・歌詞・音符・ピッキングを
 * 共通の時間軸に積み重ねて表示する。大きな画面で弾きながら見ることを想定。
 */
export function ScoreView({
  song,
  settings,
  selectedChordId,
  onSelectChord,
  onToggleAccent,
  rhythmEdit,
  onMeasureClick,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => {
    let offset = 0;
    return song.sections.map((section) => {
      const rows = sectionMeasureRows(song, section);
      const item = { section, rows, offset };
      offset += rows.length;
      return item;
    });
  }, [song]);

  const visuals = useMemo(() => {
    const cache = new Map<string, ChordVisual>();
    return (chord: ChordEvent): ChordVisual => {
      if (!cache.has(chord.id)) {
        const r = resolveForm(song, chord);
        cache.set(chord.id, r.form ? { positions: r.form.positions, rootPc: r.analysis?.chord?.root ?? null } : null);
      }
      return cache.get(chord.id)!;
    };
  }, [song]);

  // 選択中のコードが画面外に出たら見える位置までスクロールする（前／次ボタン・キー操作用）
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".tl-slot.selected");
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selectedChordId]);

  const display = {
    variant: "score" as const,
    showDiagram: settings.showTab,
    showPiano: settings.showPiano,
    showLyrics: settings.showLyrics,
    showRhythm: settings.showRhythm,
    showStrokes: settings.showStrokes,
    tabLabelMode: settings.tabLabelMode,
    pianoLabelMode: settings.pianoLabelMode,
  };

  return (
    <div className="score" ref={ref}>
      {sections.map(({ section, rows, offset }) => (
        <section key={section.id} className="score-section" aria-label={section.name}>
          <h2 className="prog-section-name">{section.name}</h2>
          <RhythmTimeline
            className="score-grid"
            rows={rows}
            timeSignature={song.timeSignature}
            display={display}
            visualFor={visuals}
            selectedChordId={selectedChordId}
            onSelectChord={onSelectChord}
            onToggleAccent={onToggleAccent}
            measureNumberOffset={offset}
            measureSelection={
              onMeasureClick
                ? {
                    isSelected: (row) =>
                      !!rhythmEdit &&
                      offset + row.measureIndex >= rhythmEdit.from &&
                      offset + row.measureIndex <= rhythmEdit.to,
                    onClick: (row) => onMeasureClick(offset + row.measureIndex),
                  }
                : undefined
            }
          />
        </section>
      ))}
      {song.sections.length === 0 && <p className="muted">コードがまだありません。「編集」から追加してください。</p>}
    </div>
  );
}
