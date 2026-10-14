import { useMemo, useState } from "react";
import { ChordPalette } from "../../components/ChordPalette";
import {
  NO_CHORD,
  parsePastedLyrics,
  removeMark,
  setMark,
  sheetToSong,
  songToSheet,
  type SheetPos,
} from "../../model/lyricSheet";
import { chordNamesInSong } from "../../model/songOps";
import type { Song } from "../../model/types";
import { parseChord } from "../../music/chord";

type Props = {
  song: Song;
  onSongChange: (song: Song) => void;
  /** 開いたときに貼り付け欄を出す（歌詞から新しく作るとき） */
  startWithPaste?: boolean;
};

/**
 * 歌詞シート：貼り付けた歌詞の文字をタップして、その上にコードを置く。
 * シートは曲データから作る見え方なので、置いたコードはそのまま譜面・TAB・再生に反映される。
 */
export function LyricSheet({ song, onSongChange, startWithPaste = false }: Props) {
  const sheet = useMemo(() => songToSheet(song), [song]);
  const [pos, setPos] = useState<SheetPos | null>(null);
  const [pasteOpen, setPasteOpen] = useState(startWithPaste || song.sections.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [typed, setTyped] = useState("");

  const line = pos ? sheet[pos.section]?.lines[pos.line] : undefined;
  const markHere = line?.marks.find((mk) => mk.at === pos!.at);
  const usedChords = chordNamesInSong(song).filter((n) => n !== NO_CHORD);

  const place = (name: string) => {
    if (!pos || !name.trim()) return;
    onSongChange(sheetToSong(song, setMark(sheet, pos, name.trim())));
  };
  const remove = () => {
    if (!pos) return;
    onSongChange(sheetToSong(song, removeMark(sheet, pos)));
  };
  const step = (delta: number) => {
    if (!pos || !line) return;
    const at = Math.min(line.chars.length, Math.max(0, pos.at + delta));
    setPos({ ...pos, at });
  };

  const applyPaste = () => {
    const parsed = parsePastedLyrics(pasteText);
    if (parsed.length === 0) return;
    const hasContent = song.sections.some((s) => s.chords.some((c) => c.lyrics.length || c.chordName !== NO_CHORD));
    if (hasContent && !window.confirm("今のコード進行と歌詞は、貼り付けた歌詞に置き換わります。よろしいですか？"))
      return;
    onSongChange(sheetToSong({ ...song, sections: [] }, parsed));
    setPasteOpen(false);
    setPasteText("");
    setPos({ section: 0, line: 0, at: 0 });
  };

  return (
    <div className="lyric-sheet">
      <div className="btn-row">
        <button type="button" className="small-btn" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
          歌詞を貼り付け
        </button>
        <span className="muted small">
          歌詞の文字をタップして、その文字から始まるコードを選びます。行の右端の「＋」は歌詞のないコード（前奏など）。
          最初は1コード＝1小節。長さは「✎コード」で変えられます。
        </span>
      </div>
      {pasteOpen && (
        <div className="card">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            aria-label="貼り付ける歌詞"
            placeholder={"[Aメロ]\nあさのひかりが まどをたたく\nねむいめをこすり\n\n[サビ]\nひかりのなかへ"}
          />
          <div className="btn-row">
            <button type="button" className="small-btn primary" onClick={applyPaste} disabled={!pasteText.trim()}>
              シートにする
            </button>
            <span className="muted small">
              [Aメロ]・【サビ】のような行はセクション名、空行はセクションの区切りになります。
            </span>
          </div>
        </div>
      )}

      {sheet.map((section, si) => (
        <section key={section.id ?? si} className="sheet-section" aria-label={section.name}>
          <h2 className="prog-section-name">{section.name}</h2>
          {section.lines.map((ln, li) => (
            <div key={li} className="sheet-line">
              {[...ln.chars, null].map((ch, at) => {
                const names = ln.marks.filter((mk) => mk.at === at).map((mk) => mk.name);
                const selected = pos?.section === si && pos.line === li && pos.at === at;
                return (
                  <button
                    key={at}
                    type="button"
                    className={`sheet-cell${ch === null ? " end" : ""}${selected ? " selected" : ""}${names.length ? " has-chord" : ""}`}
                    onClick={() => {
                      setPos({ section: si, line: li, at });
                      setTyped("");
                    }}
                    aria-label={`${ch === null ? "行末" : `「${ch}」`}${names.length ? `（${names.join("・")}）` : ""}`}
                    aria-pressed={selected}
                  >
                    <span className={`sheet-chord${names.includes(NO_CHORD) ? " nc" : ""}`}>{names.join(" ")}</span>
                    <span className="sheet-char">{ch === null ? "＋" : ch === " " ? " " : ch}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </section>
      ))}

      {pos && line && (
        <div className="edit-panel sheet-panel" role="region" aria-label="コードを置く">
          <div className="btn-row">
            <strong>{pos.at < line.chars.length ? `「${line.chars[pos.at]}」の位置` : "行末（歌詞なし）"}</strong>
            <span className="ce-preview-name">{markHere ? markHere.name : ""}</span>
            <button type="button" className="small-btn" onClick={() => step(-1)} aria-label="前の文字">
              ◀
            </button>
            <button type="button" className="small-btn" onClick={() => step(1)} aria-label="次の文字">
              ▶
            </button>
            {markHere && (
              <button type="button" className="small-btn danger" onClick={remove}>
                取り除く
              </button>
            )}
            <button type="button" className="small-btn" onClick={() => setPos(null)}>
              閉じる
            </button>
          </div>
          {usedChords.length > 0 && (
            <div className="ce-palette" role="group" aria-label="この曲のコード">
              {usedChords.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip used${markHere?.name === n ? " on" : ""}`}
                  onClick={() => place(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <ChordPalette value={markHere && markHere.name !== NO_CHORD ? markHere.name : undefined} onChange={place} />
          <div className="btn-row">
            <input
              type="text"
              className={`chord-name-input${!typed || parseChord(typed.trim()) ? "" : " invalid"}`}
              aria-label="コード名を入力"
              placeholder="例: F#m7"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  place(typed);
                  setTyped("");
                }
              }}
            />
            <button
              type="button"
              className="small-btn"
              disabled={!typed.trim()}
              onClick={() => {
                place(typed);
                setTyped("");
              }}
            >
              置く
            </button>
            <button type="button" className="small-btn" onClick={() => place(NO_CHORD)}>
              N.C.（コードなし）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
