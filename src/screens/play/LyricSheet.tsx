import { useMemo, useState } from "react";
import { ChordPalette } from "../../components/ChordPalette";
import { keyboardRange, PianoView } from "../../components/PianoView";
import { TabView } from "../../components/TabView";
import {
  marksAt,
  NO_CHORD,
  parsePastedLyrics,
  removeMark,
  renameSheetSection,
  toggleBar,
  barCount,
  setLineText,
  setMark,
  sheetToSong,
  songToSheet,
  type SheetLine,
  type SheetPos,
} from "../../model/lyricSheet";
import { chordNamesInSong, resolveForm } from "../../model/songOps";
import type { ChordEvent, DisplaySettings, Song } from "../../model/types";
import { parseChord, soundingNotes, type SoundingNote } from "../../music/chord";
import { LineRhythmBlock } from "./LineRhythmBlock";

type Props = {
  song: Song;
  settings: DisplaySettings;
  onSongChange: (song: Song) => void;
  /** 編集中：文字をタップしてコードを置く・歌詞を直す・リズムを採譜する */
  editing: boolean;
  /** 開いたときに貼り付け欄を出す（歌詞から新しく作るとき） */
  startWithPaste?: boolean;
  /** 通し再生中の位置（セクション・行・その行の何小節目か） */
  playhead?: { section: number; line: number; bar: number } | null;
  /** 見るときにコードをタップした（拡大表示） */
  onOpenChord?: (chordId: string) => void;
};

/**
 * 歌詞とコード：歌詞の文字の上にコード名とコード図を出す（U-FRET のような見た目）。
 * コードの長さやタイミングは持たず、どの文字から弾き始めるかだけを置く。
 * 編集中は文字をタップしてコードを置く。シートは曲データから作る見え方なので、置いたコードはそのまま保存される。
 */
export function LyricSheet({
  song,
  settings,
  onSongChange,
  editing,
  startWithPaste = false,
  playhead = null,
  onOpenChord,
}: Props) {
  const sheet = useMemo(() => songToSheet(song), [song]);
  const chordById = useMemo(() => {
    const map = new Map<string, ChordEvent>();
    for (const s of song.sections) for (const c of s.chords) map.set(c.id, c);
    return map;
  }, [song]);
  const [pos, setPos] = useState<SheetPos | null>(null);
  const [pasteOpen, setPasteOpen] = useState(startWithPaste || song.sections.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [typed, setTyped] = useState("");
  // コード一覧（ルート×種類）。まだコードがない曲では最初から開いておく
  const [paletteOpen, setPaletteOpen] = useState(
    () => !song.sections.some((s) => s.chords.some((c) => c.chordName !== NO_CHORD)),
  );
  const [lineEdit, setLineEdit] = useState<{ section: number; line: number; text: string } | null>(null);

  const active = editing ? pos : null;
  const line = active ? sheet[active.section]?.lines[active.line] : undefined;
  // 歌詞のないコードが続くと同じ位置に複数重なる。k 番目を編集対象にする（k = 数なら新しく足す）
  const here = active ? marksAt(sheet, active) : [];
  const k = Math.min(active?.k ?? 0, here.length);
  const markHere = here[k];
  const usedChords = chordNamesInSong(song).filter((n) => n !== NO_CHORD);

  const place = (name: string) => {
    if (!active || !name.trim()) return;
    onSongChange(sheetToSong(song, setMark(sheet, { ...active, k }, name.trim())));
  };
  const remove = () => {
    if (!active || !markHere) return;
    onSongChange(sheetToSong(song, removeMark(sheet, { ...active, k })));
    setPos({ ...active, k: Math.max(0, Math.min(k, here.length - 2)) });
  };
  const step = (delta: number) => {
    if (!active || !line) return;
    const at = Math.min(line.chars.length, Math.max(0, active.at + delta));
    setPos({ ...active, at, k: 0 });
  };

  const applyPaste = () => {
    const parsed = parsePastedLyrics(pasteText);
    if (parsed.length === 0) return;
    const hasContent = song.sections.some((s) => s.chords.some((c) => c.lyrics.length || c.chordName !== NO_CHORD));
    if (hasContent && !window.confirm("今の歌詞とコードは、貼り付けた歌詞に置き換わります。よろしいですか？")) return;
    onSongChange(sheetToSong({ ...song, sections: [] }, parsed));
    setPasteOpen(false);
    setPasteText("");
    setPos({ section: 0, line: 0, at: 0 });
  };

  const saveLine = () => {
    if (!lineEdit) return;
    const cur = sheet[lineEdit.section]?.lines[lineEdit.line];
    if (cur && cur.chars.join("") !== lineEdit.text)
      onSongChange(sheetToSong(song, setLineText(sheet, lineEdit, lineEdit.text)));
    setLineEdit(null);
  };

  const diagram = (chordId: string | undefined) => {
    if ((!settings.showTab && !settings.showPiano) || !chordId) return null;
    const chord = chordById.get(chordId);
    if (!chord || chord.chordName === NO_CHORD) return null;
    const r = resolveForm(song, chord);
    if (!r.form) return null;
    const rootPc = r.analysis?.chord?.root ?? null;
    return (
      <>
        {settings.showTab && (
          <span className="sheet-diagram">
            <TabView
              showOpenStrings={settings.showOpenStrings}
              positions={r.form.positions}
              labelMode={settings.tabLabelMode}
              rootPc={rootPc}
              compact
              fretCount={4}
            />
          </span>
        )}
        {settings.showPiano && (
          <span className="sheet-piano">
            <PianoView
              notes={soundingNotes(r.form.positions)}
              labelMode={settings.pianoLabelMode}
              rootPc={rootPc}
              range={inlinePianoRange(soundingNotes(r.form.positions))}
            />
          </span>
        )}
      </>
    );
  };

  return (
    <div className={`lyric-sheet${editing ? " editing" : ""}${settings.showTab ? " with-diagrams" : ""}`}>
      {editing && (
        <div className="btn-row">
          <button type="button" className="small-btn" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
            歌詞を貼り付け
          </button>
          <span className="muted small">
            歌詞の文字をタップして、その文字から弾くコードを選びます。行の右端の「＋」は歌詞のないところ（前奏など）。
          </span>
        </div>
      )}
      {editing && pasteOpen && (
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
              [Aメロ]・【サビ】のような行はセクション名、空行はセクションの区切り、行の中の「|」は小節の区切りになります。
            </span>
          </div>
        </div>
      )}
      {!editing && sheet.length === 0 && (
        <p className="muted">まだ歌詞がありません。「✎ 編集」から歌詞を貼り付けてください。</p>
      )}

      {sheet.map((section, si) => {
        const sec = song.sections.find((s) => s.id === section.id);
        const renderLine = (ln: SheetLine, li: number) => {
          if (lineEdit && lineEdit.section === si && lineEdit.line === li) {
            return (
              <div key={li} className="sheet-line-edit btn-row">
                <input
                  type="text"
                  autoFocus
                  aria-label="この行の歌詞"
                  value={lineEdit.text}
                  onChange={(e) => setLineEdit({ ...lineEdit, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveLine();
                    if (e.key === "Escape") setLineEdit(null);
                  }}
                />
                <button type="button" className="small-btn primary" onClick={saveLine}>
                  決定
                </button>
                <button type="button" className="small-btn" onClick={() => setLineEdit(null)}>
                  やめる
                </button>
              </div>
            );
          }
          return (
            <div key={li} className="sheet-line">
              {segmentsOf(ln, editing).map((seg) => {
                const marks = ln.marks.filter((mk) => mk.at === seg.at);
                const shown = marks.filter((mk) => editing || mk.name !== NO_CHORD);
                const isSel = (at: number) =>
                  !!active && active.section === si && active.line === li && active.at === at;
                const select = (at: number) => {
                  setPos({ section: si, line: li, at, k: 0 });
                  setTyped("");
                };
                return (
                  <span key={seg.at} className={`sheet-seg${shown.length ? " has-chord" : ""}`}>
                    <span className="sheet-marks" onClick={editing ? () => select(seg.at) : undefined}>
                      {shown.map((mk, i) => {
                        const inner = (
                          <>
                            <span className={`sheet-chord${mk.name === NO_CHORD ? " nc" : ""}`}>{mk.name}</span>
                            {diagram(mk.chordId)}
                          </>
                        );
                        // 見るときはコードをタップで拡大（押さえ方の変更もここから）
                        return !editing && onOpenChord && mk.chordId && mk.name !== NO_CHORD ? (
                          <button
                            key={i}
                            type="button"
                            className="sheet-mark sheet-mark-btn"
                            aria-label={`コード ${mk.name} を拡大`}
                            onClick={() => onOpenChord(mk.chordId!)}
                          >
                            {inner}
                          </button>
                        ) : (
                          <span key={i} className="sheet-mark">
                            {inner}
                          </span>
                        );
                      })}
                    </span>
                    <span className="sheet-text">
                      {seg.cells.map((at) => {
                        const ch = at < ln.chars.length ? ln.chars[at] : null;
                        const barStart = !!ln.bars?.includes(at);
                        const barIndex = (ln.bars ?? []).filter((b) => b <= at).length;
                        const playingHere =
                          !!playhead && playhead.section === si && playhead.line === li && playhead.bar === barIndex;
                        const cls = `sheet-cell${ch === null ? " end" : ""}${isSel(at) ? " selected" : ""}${barStart ? " bar-start" : ""}${playingHere ? " playing-bar" : ""}`;
                        if (!editing)
                          return (
                            <span key={at} className={cls}>
                              <span className="sheet-char">{ch ?? ""}</span>
                            </span>
                          );
                        const names = ln.marks.filter((mk) => mk.at === at).map((mk) => mk.name);
                        return (
                          <button
                            key={at}
                            type="button"
                            className={cls}
                            onClick={() => select(at)}
                            aria-label={`${ch === null ? "行末" : `「${ch}」`}${names.length ? `（${names.join("・")}）` : ""}`}
                            aria-pressed={isSel(at)}
                          >
                            <span className="sheet-char">{ch === null ? "＋" : ch}</span>
                          </button>
                        );
                      })}
                    </span>
                  </span>
                );
              })}
              {editing && (
                <button
                  type="button"
                  className="icon-btn sheet-line-btn"
                  aria-label="この行の歌詞を直す"
                  title="この行の歌詞を直す"
                  onClick={() => setLineEdit({ section: si, line: li, text: ln.chars.join("") })}
                >
                  ✎
                </button>
              )}
            </div>
          );
        };
        return (
          <section key={section.id ?? si} className="sheet-section" aria-label={section.name}>
            {editing ? (
              <input
                type="text"
                className="sheet-section-name"
                aria-label="セクション名"
                defaultValue={section.name}
                key={section.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== section.name)
                    onSongChange(sheetToSong(song, renameSheetSection(sheet, si, name)));
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <h2 className="prog-section-name">{section.name}</h2>
            )}
            {section.lines.map((ln, li) => (
              <div
                key={li}
                className={`sheet-line-block${playhead && playhead.section === si && playhead.line === li ? " playing" : ""}`}
              >
                {renderLine(ln, li)}
                {/* リズム譜は行の下に置く（コードとは連動しない） */}
                {sec && (
                  <LineRhythmBlock
                    song={song}
                    section={sec}
                    line={li}
                    bars={barCount(ln)}
                    playingBar={playhead && playhead.section === si && playhead.line === li ? playhead.bar : null}
                    editing={editing}
                    onSongChange={onSongChange}
                  />
                )}
              </div>
            ))}
          </section>
        );
      })}

      {active && line && (
        <div className="edit-panel sheet-panel" role="region" aria-label="コードを置く">
          <div className="btn-row">
            <strong>{active.at < line.chars.length ? `「${line.chars[active.at]}」` : "行末"}</strong>
            {here.length > 0 && (
              <span className="btn-row" role="radiogroup" aria-label="この位置のコード">
                {here.map((mk, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={i === k}
                    className={`chip${i === k ? " on" : ""}`}
                    onClick={() => setPos({ ...active, k: i })}
                  >
                    {mk.name}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={k === here.length}
                  className={`chip${k === here.length ? " on" : ""}`}
                  onClick={() => setPos({ ...active, k: here.length })}
                >
                  ＋ もう1つ足す
                </button>
              </span>
            )}
            {active.at > 0 && active.at < line.chars.length && (
              <button
                type="button"
                className={`small-btn${line.bars?.includes(active.at) ? " active" : ""}`}
                aria-pressed={!!line.bars?.includes(active.at)}
                onClick={() => onSongChange(sheetToSong(song, toggleBar(sheet, active)))}
              >
                {line.bars?.includes(active.at) ? "｜ 小節の区切りをなくす" : "｜ ここから次の小節"}
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="small-btn" onClick={() => step(-1)} aria-label="前の文字">
              ◀
            </button>
            <button type="button" className="small-btn" onClick={() => step(1)} aria-label="次の文字">
              ▶
            </button>
            {markHere && (
              <button type="button" className="small-btn danger" onClick={remove}>
                {here.length > 1 ? `「${markHere.name}」を取り除く` : "取り除く"}
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
            <button
              type="button"
              className="small-btn"
              aria-expanded={paletteOpen}
              onClick={() => setPaletteOpen((v) => !v)}
            >
              {paletteOpen ? "一覧を閉じる" : "ほかのコードを一覧から"}
            </button>
          </div>
          {paletteOpen && (
            <ChordPalette value={markHere && markHere.name !== NO_CHORD ? markHere.name : undefined} onChange={place} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 行をコードごとのかたまりに分ける（コード名・コード図と、そのコードで歌う歌詞をまとめて並べるため）。
 * cells はかたまりに含まれる文字の位置。行末（歌詞のないコードの位置）は編集中か、そこにコードがあるときだけ出す。
 */
function segmentsOf(line: SheetLine, editing: boolean): { at: number; cells: number[] }[] {
  const n = line.chars.length;
  const starts = [...new Set([0, ...line.marks.filter((mk) => editing || mk.name !== NO_CHORD).map((mk) => mk.at)])]
    .filter((at) => at <= n)
    .sort((a, b) => a - b);
  const segs = starts.map((at, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : n;
    const cells: number[] = [];
    for (let t = at; t < end; t++) cells.push(t);
    return { at, cells };
  });
  const last = segs[segs.length - 1];
  if (editing) {
    if (last.at === n) last.cells.push(n);
    else segs.push({ at: n, cells: [n] });
  } else if (last.at === n) last.cells.push(n);
  return segs.filter((sg) => sg.cells.length > 0 || line.marks.some((mk) => mk.at === sg.at));
}

/**
 * 歌詞の上に並べる小さな鍵盤の範囲。どのコードも同じ大きさで並ぶよう C2〜B4 にそろえ、
 * ハイポジションなどで外れる音があるときだけ広げる。
 */
function inlinePianoRange(notes: SoundingNote[]): { low: number; high: number } {
  const fit = keyboardRange(notes);
  return { low: Math.min(36, fit.low), high: Math.max(71, fit.high) };
}
