import { LyricInput, TimingEditor } from "../../components/LyricEditors";
import { reconcileLyrics } from "../../music/lyrics";
import { layoutSong, SIXTEENTH } from "../../music/timeline";
import { newId } from "../../model/factory";
import { updateChord } from "../../model/songOps";
import type { Song } from "../../model/types";

/** 譜面で選んだコードの歌詞とタイミングを編集するパネル */
export function LyricsPanel({
  song,
  chordId,
  onSongChange,
}: {
  song: Song;
  chordId: string | undefined;
  onSongChange: (song: Song) => void;
}) {
  const placed = layoutSong(song).find((p) => p.chord.id === chordId);
  if (!placed) return null;
  const { chord, section } = placed;
  return (
    <div className="edit-panel" role="region" aria-label="歌詞の編集">
      <div className="btn-row lyric-row">
        <strong>
          {section.name} / {chord.chordName}
        </strong>
        <LyricInput
          key={chord.id}
          chord={chord}
          onFocus={() => undefined}
          onCommit={(text) =>
            onSongChange(
              updateChord(song, chord.id, (c) => ({
                ...c,
                lyrics: reconcileLyrics(c.lyrics, text, c.durationTicks, SIXTEENTH, newId),
              })),
            )
          }
        />
      </div>
      <TimingEditor
        key={`t-${chord.id}`}
        song={song}
        chord={chord}
        absStart={placed.absStart}
        sectionName={section.name}
        onChange={(c) => onSongChange(updateChord(song, c.id, () => c))}
      />
    </div>
  );
}
