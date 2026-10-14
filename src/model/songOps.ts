// 曲データの更新操作。整合性（コード名とフォーム、長さと歌詞位置）を保つため、
// 画面側は直接オブジェクトを書き換えずにここを通す。
import { analyzeForm, positionsFromFrets, type ChordForm, type FormAnalysis } from "../music/chord";
import { generateForms } from "../music/formGenerator";
import { clampLyrics } from "../music/lyrics";
import { SIXTEENTH } from "../music/timeline";
import { newId } from "./factory";
import type { ChordEvent, RhythmEvent, Section, Song } from "./types";

const autoFormCache = new Map<string, ChordForm | null>();

/** 自動生成の最上位候補（同じコード名なら常に同じ結果） */
export function autoForm(chordName: string): ChordForm | null {
  if (!autoFormCache.has(chordName)) {
    const best = generateForms(chordName, { maxResults: 1 })[0];
    autoFormCache.set(
      chordName,
      best ? { id: `auto:${chordName}`, chordName, positions: positionsFromFrets(best.frets) } : null,
    );
  }
  return autoFormCache.get(chordName) ?? null;
}

export type ResolvedForm = {
  form: ChordForm | null;
  source: "saved" | "auto" | "none";
  analysis: FormAnalysis | null;
};

/** コードイベントに表示すべきフォームを解決する。保存フォームのコード名が一致しなければ使わない。 */
export function resolveForm(song: Song, chord: ChordEvent): ResolvedForm {
  const saved = chord.formId ? song.forms.find((f) => f.id === chord.formId) : undefined;
  if (saved && saved.chordName === chord.chordName) {
    return { form: saved, source: "saved", analysis: analyzeForm(chord.chordName, saved.positions) };
  }
  const auto = autoForm(chord.chordName);
  if (auto) return { form: auto, source: "auto", analysis: analyzeForm(chord.chordName, auto.positions) };
  return { form: null, source: "none", analysis: null };
}

export function touch(song: Song): Song {
  return { ...song, updatedAt: new Date().toISOString() };
}

export function updateSection(song: Song, sectionId: string, fn: (s: Section) => Section): Song {
  return { ...song, sections: song.sections.map((s) => (s.id === sectionId ? fn(s) : s)) };
}

export function updateChord(song: Song, chordId: string, fn: (c: ChordEvent) => ChordEvent): Song {
  return {
    ...song,
    sections: song.sections.map((s) =>
      s.chords.some((c) => c.id === chordId)
        ? { ...s, chords: s.chords.map((c) => (c.id === chordId ? fn(c) : c)) }
        : s,
    ),
  };
}

/** コード名の変更。フォームのコード名と食い違う場合はフォーム指定を外す（古い TAB が残らないように）。 */
export function renameChord(song: Song, chordId: string, chordName: string): Song {
  return updateChord(song, chordId, (c) => {
    const form = c.formId ? song.forms.find((f) => f.id === c.formId) : undefined;
    return { ...c, chordName, formId: form && form.chordName === chordName ? c.formId : undefined };
  });
}

/** コードの長さの変更。範囲外になった歌詞は末尾に寄せる。 */
export function setChordDuration(song: Song, chordId: string, durationTicks: number): Song {
  const d = Math.max(SIXTEENTH, Math.round(durationTicks));
  return updateChord(song, chordId, (c) => ({ ...c, durationTicks: d, lyrics: clampLyrics(c.lyrics, d, SIXTEENTH) }));
}

/**
 * フォームを保存し、対象のコードに割り当てる。
 * applyToAll が true なら同じコード名のすべてのコードに割り当てる。
 * 既存フォームを編集する場合は、他のコードと共有されていても上書きされる（同じフォームを指すため）。
 */
export function saveForm(
  song: Song,
  form: { id?: string; chordName: string; frets: (number | null)[] },
  target: { chordId?: string; applyToAll: boolean },
): { song: Song; formId: string } {
  const positions = positionsFromFrets(form.frets);
  const existing = form.id ? song.forms.find((f) => f.id === form.id && f.chordName === form.chordName) : undefined;
  // 既存フォームが他のコードと共有されていて、単体にだけ適用したい場合は複製する
  const sharedElsewhere =
    existing &&
    !target.applyToAll &&
    song.sections.some((s) => s.chords.some((c) => c.formId === existing.id && c.id !== target.chordId));
  const id = existing && !sharedElsewhere ? existing.id : newId();
  const newForm: ChordForm = { id, chordName: form.chordName, positions };
  const forms =
    existing && !sharedElsewhere ? song.forms.map((f) => (f.id === id ? newForm : f)) : [...song.forms, newForm];
  const sections = song.sections.map((s) => ({
    ...s,
    chords: s.chords.map((c) => {
      const hit = target.applyToAll ? c.chordName === form.chordName : c.id === target.chordId;
      return hit ? { ...c, formId: id } : c;
    }),
  }));
  return { song: pruneForms({ ...song, forms, sections }), formId: id };
}

/** 自動生成に戻す */
export function clearForm(song: Song, chordName: string, chordId: string | undefined, applyToAll: boolean): Song {
  const sections = song.sections.map((s) => ({
    ...s,
    chords: s.chords.map((c) =>
      (applyToAll ? c.chordName === chordName : c.id === chordId) ? { ...c, formId: undefined } : c,
    ),
  }));
  return pruneForms({ ...song, sections });
}

/** どのコードからも参照されていないフォームを削除する */
export function pruneForms(song: Song): Song {
  const used = new Set(song.sections.flatMap((s) => s.chords.map((c) => c.formId).filter(Boolean)));
  return { ...song, forms: song.forms.filter((f) => used.has(f.id)) };
}

/** リズムパターン削除時、参照も外す */
export function deletePattern(song: Song, patternId: string): Song {
  const strip = <T extends { rhythmPatternId?: string }>(x: T): T =>
    x.rhythmPatternId === patternId ? { ...x, rhythmPatternId: undefined } : x;
  return {
    ...song,
    rhythmPatterns: song.rhythmPatterns.filter((p) => p.id !== patternId),
    defaultRhythmPatternId: song.defaultRhythmPatternId === patternId ? undefined : song.defaultRhythmPatternId,
    sections: song.sections.map((s) => ({ ...strip(s), chords: s.chords.map(strip) })),
  };
}

/** 曲の中で使われているコード名（出現順・重複なし） */
export function chordNamesInSong(song: Song): string[] {
  const names: string[] = [];
  for (const s of song.sections) for (const c of s.chords) if (!names.includes(c.chordName)) names.push(c.chordName);
  return names;
}

export function findChord(song: Song, chordId: string | undefined): { chord: ChordEvent; section: Section } | null {
  if (!chordId) return null;
  for (const section of song.sections) {
    const chord = section.chords.find((c) => c.id === chordId);
    if (chord) return { chord, section };
  }
  return null;
}

/**
 * 小節のリズムを直接設定する（events = null で解除し、パターンに従うように戻す）。
 * measure はセクション内の小節番号。
 */
export function setMeasureRhythm(
  song: Song,
  sectionId: string,
  measure: number,
  events: Omit<RhythmEvent, "id">[] | null,
): Song {
  return updateSection(song, sectionId, (s) => {
    const rest = (s.measureRhythms ?? []).filter((r) => r.measure !== measure);
    const next = events ? [...rest, { measure, events: events.map((e) => ({ ...e, id: newId() })) }] : rest;
    next.sort((a, b) => a.measure - b.measure);
    return { ...s, measureRhythms: next.length ? next : undefined };
  });
}
