import { describe, expect, it } from "vitest";
import { formShorthand } from "../../music/chord";
import { createSampleSong, makeChord, makeSection } from "../factory";
import { clearForm, deletePattern, renameChord, resolveForm, saveForm, setChordDuration } from "../songOps";
import type { Song } from "../types";

function base(): Song {
  const s = createSampleSong();
  s.sections = [makeSection("A", [makeChord("C", 48, "あいう"), makeChord("C", 48), makeChord("G", 48)])];
  s.forms = [];
  return s;
}

describe("曲データの整合性", () => {
  it("フォーム未指定なら自動生成の最上位候補", () => {
    const s = base();
    const r = resolveForm(s, s.sections[0].chords[0]);
    expect(r.source).toBe("auto");
    expect(formShorthand(r.form!.positions)).toBe("x32010");
    expect(r.analysis!.valid).toBe(true);
  });

  it("フォームを保存すると同名コードすべてに反映される", () => {
    const s = base();
    const { song } = saveForm(s, { chordName: "C", frets: [null, 3, 5, 5, 5, 3] }, { applyToAll: true });
    for (const c of song.sections[0].chords.filter((c) => c.chordName === "C")) {
      const r = resolveForm(song, c);
      expect(r.source).toBe("saved");
      expect(formShorthand(r.form!.positions)).toBe("x35553");
    }
    expect(resolveForm(song, song.sections[0].chords[2]).source).toBe("auto");
  });

  it("単体のみに適用した場合、共有フォームは複製される", () => {
    let s = base();
    const first = saveForm(s, { chordName: "C", frets: [null, 3, 5, 5, 5, 3] }, { applyToAll: true });
    s = first.song;
    const target = s.sections[0].chords[1].id;
    const second = saveForm(
      s,
      { id: first.formId, chordName: "C", frets: [8, 10, 10, 9, 8, 8] },
      { chordId: target, applyToAll: false },
    );
    const [c0, c1] = second.song.sections[0].chords;
    expect(formShorthand(resolveForm(second.song, c0).form!.positions)).toBe("x35553");
    expect(formShorthand(resolveForm(second.song, c1).form!.positions)).toBe("8-10-10-9-8-8");
  });

  it("コード名を変えると古いフォームは使われない（TAB が古いまま残らない）", () => {
    const s = saveForm(base(), { chordName: "C", frets: [null, 3, 5, 5, 5, 3] }, { applyToAll: true }).song;
    const renamed = renameChord(s, s.sections[0].chords[0].id, "Am");
    const r = resolveForm(renamed, renamed.sections[0].chords[0]);
    expect(r.form!.chordName).toBe("Am");
    expect(formShorthand(r.form!.positions)).toBe("x02210");
    expect(renamed.sections[0].chords[0].formId).toBeUndefined();
  });

  it("自動生成に戻すと未使用フォームは削除される", () => {
    const s = saveForm(base(), { chordName: "C", frets: [null, 3, 5, 5, 5, 3] }, { applyToAll: true }).song;
    const cleared = clearForm(s, "C", undefined, true);
    expect(cleared.forms).toEqual([]);
  });

  it("コードを短くすると歌詞が範囲内に収まる", () => {
    const s = base();
    const c = s.sections[0].chords[0];
    const next = setChordDuration(s, c.id, 12);
    expect(next.sections[0].chords[0].lyrics.every((l) => l.startTick < 12)).toBe(true);
  });

  it("パターン削除で参照も外れる", () => {
    const s = createSampleSong();
    const id = s.sections[2].rhythmPatternId!;
    const next = deletePattern(s, id);
    expect(next.sections[2].rhythmPatternId).toBeUndefined();
    expect(next.rhythmPatterns.find((p) => p.id === id)).toBeUndefined();
  });
});
