// 曲データの更新操作。整合性（コード名とフォーム、長さと歌詞位置）を保つため、
// 画面側は直接オブジェクトを書き換えずにここを通す。
import { analyzeForm, positionsFromFrets, type ChordForm, type FormAnalysis } from "../music/chord";
import { generateForms } from "../music/formGenerator";
import { clampLyrics } from "../music/lyrics";
import { SIXTEENTH } from "../music/timeline";
import { makeChord, makeSection, newId } from "./factory";
import type { ChordEvent, RhythmEvent, Section, SectionRhythm, Song } from "./types";

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

/**
 * コードの切り替え位置を動かす（chordId のコードの始まりを delta だけ遅く／負なら早くする）。
 * 前のコードが伸び、このコードが縮む（またはその逆）。曲全体の長さは変わらず、
 * 歌詞は曲の中の位置をそのまま保って、境目をまたいだ文字は隣のコードへ移る。
 * セクションの最初のコード、またはどちらかが 16分より短くなるときは null。
 */
export function moveChordStart(song: Song, chordId: string, delta: number): Song | null {
  const found = findChord(song, chordId);
  if (!found || delta === 0) return null;
  const chords = found.section.chords;
  const i = chords.findIndex((c) => c.id === chordId);
  if (i <= 0) return null;
  const prev = chords[i - 1];
  const cur = chords[i];
  const prevDur = prev.durationTicks + delta;
  const curDur = cur.durationTicks - delta;
  if (prevDur < SIXTEENTH || curDur < SIXTEENTH) return null;
  // 前のコードの始まりからの位置で並べ直し、新しい境目で振り分ける
  const all = [
    ...prev.lyrics.map((l) => ({ ...l, abs: l.startTick })),
    ...cur.lyrics.map((l) => ({ ...l, abs: l.startTick + prev.durationTicks })),
  ];
  const strip = ({ abs, ...l }: (typeof all)[number]) => ({ ...l, startTick: abs });
  const prevLyrics = all.filter((l) => l.abs < prevDur).map(strip);
  const curLyrics = all
    .filter((l) => l.abs >= prevDur)
    .map(strip)
    .map((l) => ({ ...l, startTick: l.startTick - prevDur }));
  return updateSection(song, found.section.id, (s) => ({
    ...s,
    chords: s.chords.map((c, j) =>
      j === i - 1
        ? { ...c, durationTicks: prevDur, lyrics: prevLyrics }
        : j === i
          ? { ...c, durationTicks: curDur, lyrics: curLyrics }
          : c,
    ),
  }));
}

/**
 * コードの終わりを動かす。後ろにコードがあれば切り替え位置を動かし（曲の長さは同じ）、
 * セクションの最後のコードなら長さそのものを変える。
 */
export function moveChordEnd(song: Song, chordId: string, delta: number): Song | null {
  const found = findChord(song, chordId);
  if (!found || delta === 0) return null;
  const chords = found.section.chords;
  const i = chords.findIndex((c) => c.id === chordId);
  const next = chords[i + 1];
  if (next) return moveChordStart(song, next.id, delta);
  const d = found.chord.durationTicks + delta;
  return d < SIXTEENTH ? null : setChordDuration(song, chordId, d);
}

/** 前のコードとつなげる（このコードを消し、長さと歌詞を前のコードに足す。歌詞の位置はそのまま） */
export function mergeWithPrevious(song: Song, chordId: string): Song | null {
  const found = findChord(song, chordId);
  if (!found) return null;
  const chords = found.section.chords;
  const i = chords.findIndex((c) => c.id === chordId);
  if (i <= 0) return null;
  const prev = chords[i - 1];
  const cur = chords[i];
  const merged = {
    ...prev,
    durationTicks: prev.durationTicks + cur.durationTicks,
    lyrics: [...prev.lyrics, ...cur.lyrics.map((l) => ({ ...l, startTick: l.startTick + prev.durationTicks }))],
    lineBreak: cur.lineBreak,
  };
  return pruneForms(
    updateSection(song, found.section.id, (s) => ({
      ...s,
      chords: s.chords.flatMap((c, j) => (j === i - 1 ? [merged] : j === i ? [] : [c])),
    })),
  );
}

/** コードの長さの変更。範囲外になった歌詞は消さずに末尾へ詰める。 */
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

/** 歌詞の行のリズム譜を設定する（null で消す）。line はセクション内の行番号 */
export function setLineRhythm(song: Song, sectionId: string, line: number, rhythm: SectionRhythm | null): Song {
  return updateSection(song, sectionId, (s) => {
    const rest = (s.lineRhythms ?? []).filter((r) => r.line !== line);
    const next = rhythm
      ? [
          ...rest,
          { line, lengthTicks: rhythm.lengthTicks, events: rhythm.events.map((e) => ({ ...e, id: e.id || newId() })) },
        ].sort((a, b) => a.line - b.line)
      : rest;
    return { ...s, lineRhythms: next.length ? next : undefined };
  });
}

// ---- コード進行の編集（譜面から行う） ----

/** コードを、指定のコードの前（position = "before"）または後ろに追加する */
export function insertChord(
  song: Song,
  chordId: string,
  position: "before" | "after",
  chordName: string,
  durationTicks: number,
): { song: Song; chordId: string } {
  const created = makeChord(chordName, durationTicks);
  const sections = song.sections.map((s) => {
    const i = s.chords.findIndex((c) => c.id === chordId);
    if (i < 0) return s;
    const chords = [...s.chords];
    chords.splice(position === "before" ? i : i + 1, 0, created);
    return { ...s, chords };
  });
  return { song: { ...song, sections }, chordId: created.id };
}

/** コードを削除する（歌詞も一緒に消える）。未使用になったフォームも整理する */
export function deleteChord(song: Song, chordId: string): Song {
  return pruneForms({
    ...song,
    sections: song.sections.map((s) => ({ ...s, chords: s.chords.filter((c) => c.id !== chordId) })),
  });
}

/**
 * コードを2つに分ける（前半はそのまま、後半は同じコード名の新しいコード）。
 * 歌詞は位置に応じて前半・後半に振り分ける。
 */
export function splitChord(song: Song, chordId: string, atTicks: number): { song: Song; chordId: string } | null {
  const found = findChord(song, chordId);
  if (!found || atTicks <= 0 || atTicks >= found.chord.durationTicks) return null;
  const c = found.chord;
  const second = {
    ...makeChord(c.chordName, c.durationTicks - atTicks),
    formId: c.formId,
    rhythmPatternId: c.rhythmPatternId,
    lineBreak: c.lineBreak,
    lyrics: c.lyrics.filter((l) => l.startTick >= atTicks).map((l) => ({ ...l, startTick: l.startTick - atTicks })),
  };
  // 行の終わりの印は後半に移す
  const first = {
    ...c,
    durationTicks: atTicks,
    lyrics: c.lyrics.filter((l) => l.startTick < atTicks),
    lineBreak: undefined,
  };
  const sections = song.sections.map((s) => {
    const i = s.chords.findIndex((x) => x.id === chordId);
    if (i < 0) return s;
    const chords = [...s.chords];
    chords.splice(i, 1, first, second);
    return { ...s, chords };
  });
  return { song: { ...song, sections }, chordId: second.id };
}

export function addSection(song: Song, afterSectionId: string | null, name: string, measureTicks: number): Song {
  const section = makeSection(name, [makeChord("C", measureTicks)]);
  const sections = [...song.sections];
  const i = afterSectionId ? sections.findIndex((s) => s.id === afterSectionId) : sections.length - 1;
  sections.splice(i + 1, 0, section);
  return { ...song, sections };
}

export function deleteSection(song: Song, sectionId: string): Song {
  return pruneForms({ ...song, sections: song.sections.filter((s) => s.id !== sectionId) });
}

export function moveSection(song: Song, sectionId: string, delta: number): Song {
  const i = song.sections.findIndex((s) => s.id === sectionId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= song.sections.length) return song;
  const sections = [...song.sections];
  const [x] = sections.splice(i, 1);
  sections.splice(j, 0, x);
  return { ...song, sections };
}

/** セクションを複製する（コード・フォーム指定・リズムの設定・小節のリズムも。歌詞は複製しない） */
export function duplicateSection(song: Song, sectionId: string): Song {
  const i = song.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return song;
  const src = song.sections[i];
  const copy: Section = {
    ...makeSection(
      `${src.name}（コピー）`,
      src.chords.map((c) => ({
        ...makeChord(c.chordName, c.durationTicks),
        formId: c.formId,
        rhythmPatternId: c.rhythmPatternId,
      })),
    ),
    rhythmPatternId: src.rhythmPatternId,
    measureRhythms: src.measureRhythms?.map((r) => ({
      measure: r.measure,
      events: r.events.map((e) => ({ ...e, id: newId() })),
    })),
  };
  const sections = [...song.sections];
  sections.splice(i + 1, 0, copy);
  return { ...song, sections };
}
