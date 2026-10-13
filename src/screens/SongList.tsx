import { useRef } from "react";
import type { Song } from "../model/types";
import { layoutSong, ticksPerMeasure } from "../music/timeline";

type Props = {
  songs: Song[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onAddSample: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (ids: string[]) => void;
  onImport: (file: File) => void;
};

export function SongList({ songs, onOpen, onCreate, onAddSample, onDuplicate, onDelete, onExport, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const sorted = [...songs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="song-list-screen">
      <header className="app-header">
        <h1>ギター演奏ノート</h1>
        <p className="muted small">指板の音名を覚えながら、コード進行・リズム・歌詞を見て演奏するためのアプリ</p>
      </header>
      <div className="btn-row">
        <button type="button" className="primary" onClick={onCreate}>
          ＋ 新しい曲
        </button>
        <button type="button" className="small-btn" onClick={onAddSample}>
          サンプル曲を追加
        </button>
        <button type="button" className="small-btn" onClick={() => fileRef.current?.click()}>
          JSON を読み込む
        </button>
        <button
          type="button"
          className="small-btn"
          onClick={() => onExport(songs.map((s) => s.id))}
          disabled={songs.length === 0}
        >
          すべて書き出す
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
      </div>
      {sorted.length === 0 && <p className="muted">保存された曲はありません。</p>}
      <ul className="song-list">
        {sorted.map((song) => {
          const placed = layoutSong(song);
          const measures = song.sections.reduce(
            (a, s) =>
              a + Math.ceil(s.chords.reduce((x, c) => x + c.durationTicks, 0) / ticksPerMeasure(song.timeSignature)),
            0,
          );
          return (
            <li key={song.id} className="card song-item">
              <button type="button" className="song-open" onClick={() => onOpen(song.id)}>
                <span className="song-item-title">{song.title || "無題の曲"}</span>
                <span className="muted small">
                  ♩={song.tempo}・{song.timeSignature.numerator}/{song.timeSignature.denominator}・
                  {song.sections.length}セクション・{measures}小節・コード{placed.length}個
                </span>
                <span className="muted small">更新: {new Date(song.updatedAt).toLocaleString("ja-JP")}</span>
              </button>
              <div className="btn-row">
                <button type="button" className="small-btn" onClick={() => onExport([song.id])}>
                  書き出す
                </button>
                <button type="button" className="small-btn" onClick={() => onDuplicate(song.id)}>
                  複製
                </button>
                <button
                  type="button"
                  className="small-btn danger"
                  onClick={() => window.confirm(`「${song.title}」を削除しますか？`) && onDelete(song.id)}
                >
                  削除
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        データはこのブラウザ内（localStorage）に保存されます。バックアップには「書き出す」を使ってください。
      </p>
    </div>
  );
}
