// ブラウザ内（localStorage）への保存。
// 保存形式はバージョン付きの JSON とし、JSON エクスポート・インポートや
// 将来のクラウド同期でも同じ形式（normalizeSong を通したもの）を使う。
import { newId } from "../model/factory";
import { DEFAULT_SETTINGS, type DisplaySettings, type Song } from "../model/types";
import { isValidTimeSignature } from "../music/timeline";
import type { StringNumber } from "../music/pitch";

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "guitar-player/v1";

export type AppState = {
  schemaVersion: number;
  songs: Song[];
  settings: DisplaySettings;
  lastSongId?: string;
};

export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadState(store: KeyValueStore | null = defaultStore()): AppState | null {
  if (!store) return null;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.error("保存データの読み込みに失敗しました", e);
    return null;
  }
}

export function saveState(state: AppState, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  store.setItem(STORAGE_KEY, JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION }));
}

// ---- 検証・正規化（インポートしたデータもここを通す） ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const int = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const LABEL_MODES = ["solfege", "abc", "hidden"] as const;
const ACTIONS = ["downstroke", "upstroke", "pluck", "mute", "none"] as const;

export function normalizeSettings(v: unknown): DisplaySettings {
  const o = isObj(v) ? v : {};
  // 譜面表示より前の設定（showStrokes がない）では、ピアノは新しい既定（オフ）にそろえる
  const legacy = isObj(v) && !("showStrokes" in o);
  const bool = (k: keyof DisplaySettings) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean);
  const mode = (k: "tabLabelMode" | "pianoLabelMode") =>
    LABEL_MODES.includes(o[k] as (typeof LABEL_MODES)[number])
      ? (o[k] as DisplaySettings[typeof k])
      : DEFAULT_SETTINGS[k];
  return {
    playView: o.playView === "detail" ? "detail" : "score",
    showTab: bool("showTab"),
    showPiano: legacy ? DEFAULT_SETTINGS.showPiano : bool("showPiano"),
    showLyrics: bool("showLyrics"),
    showRhythm: bool("showRhythm"),
    showStrokes: bool("showStrokes"),
    tabLabelMode: mode("tabLabelMode"),
    pianoLabelMode: mode("pianoLabelMode"),
  };
}

export function normalizeSong(v: unknown): Song {
  if (!isObj(v)) throw new Error("曲データの形式が正しくありません");
  const now = new Date().toISOString();
  const tsIn = isObj(v.timeSignature) ? v.timeSignature : {};
  const ts = { numerator: int(tsIn.numerator, 4), denominator: int(tsIn.denominator, 4) };
  const timeSignature = isValidTimeSignature(ts) ? ts : { numerator: 4, denominator: 4 };

  const rhythmPatterns = arr(v.rhythmPatterns)
    .filter(isObj)
    .map((p) => {
      const lengthTicks = int(p.lengthTicks, 48, 1);
      return {
        id: str(p.id, newId()),
        name: str(p.name, "パターン"),
        lengthTicks,
        events: arr(p.events)
          .filter(isObj)
          .map((e) => ({
            id: str(e.id, newId()),
            startTick: int(e.startTick, 0, 0, lengthTicks - 1),
            durationTicks: int(e.durationTicks, 12, 1, lengthTicks),
            kind: e.kind === "rest" ? ("rest" as const) : ("note" as const),
            guitarAction: ACTIONS.includes(e.guitarAction as (typeof ACTIONS)[number])
              ? (e.guitarAction as (typeof ACTIONS)[number])
              : ("none" as const),
          })),
      };
    });
  const patternIds = new Set(rhythmPatterns.map((p) => p.id));
  const patternRef = (x: unknown) => (typeof x === "string" && patternIds.has(x) ? x : undefined);

  const forms = arr(v.forms)
    .filter(isObj)
    .map((f) => {
      const positions = ([6, 5, 4, 3, 2, 1] as StringNumber[]).map((s) => {
        const p = arr(f.positions)
          .filter(isObj)
          .find((x) => x.stringNumber === s);
        const fret =
          p && typeof p.fret === "number" && Number.isInteger(p.fret) && p.fret >= 0 && p.fret <= 24 ? p.fret : null;
        return { stringNumber: s, fret };
      });
      return { id: str(f.id, newId()), chordName: str(f.chordName, ""), positions };
    });
  const formIds = new Set(forms.map((f) => f.id));

  const sections = arr(v.sections)
    .filter(isObj)
    .map((s) => ({
      id: str(s.id, newId()),
      name: str(s.name, "セクション"),
      rhythmPatternId: patternRef(s.rhythmPatternId),
      chords: arr(s.chords)
        .filter(isObj)
        .map((c) => {
          const durationTicks = int(c.durationTicks, 48, 1);
          return {
            id: str(c.id, newId()),
            chordName: str(c.chordName, "C"),
            durationTicks,
            formId: typeof c.formId === "string" && formIds.has(c.formId) ? c.formId : undefined,
            rhythmPatternId: patternRef(c.rhythmPatternId),
            lyrics: arr(c.lyrics)
              .filter(isObj)
              .map((l) => ({
                id: str(l.id, newId()),
                text: str(l.text, ""),
                startTick: int(l.startTick, 0, 0, durationTicks - 1),
                accentMarked: l.accentMarked === true,
              }))
              .filter((l) => l.text.length > 0),
          };
        }),
    }));

  return {
    id: str(v.id, newId()),
    title: str(v.title, "無題の曲"),
    tempo: int(v.tempo, 90, 20, 400),
    timeSignature,
    sections,
    forms,
    rhythmPatterns,
    defaultRhythmPatternId: patternRef(v.defaultRhythmPatternId),
    createdAt: str(v.createdAt, now),
    updatedAt: str(v.updatedAt, now),
  };
}

export function normalizeState(v: unknown): AppState {
  if (!isObj(v)) throw new Error("保存データの形式が正しくありません");
  const version = int(v.schemaVersion, 0);
  if (version > SCHEMA_VERSION) throw new Error(`新しい形式のデータです（version ${version}）`);
  const songs = arr(v.songs).map(normalizeSong);
  return {
    schemaVersion: SCHEMA_VERSION,
    songs,
    settings: normalizeSettings(v.settings),
    lastSongId: typeof v.lastSongId === "string" ? v.lastSongId : undefined,
  };
}

// ---- JSON エクスポート・インポート ----

export type SongExport = { format: "guitar-player-song"; schemaVersion: number; songs: Song[] };

export function exportSongs(songs: Song[]): string {
  const data: SongExport = { format: "guitar-player-song", schemaVersion: SCHEMA_VERSION, songs };
  return JSON.stringify(data, null, 2);
}

/** インポートした曲は既存の曲と衝突しないよう新しい ID を振る */
export function importSongs(json: string): Song[] {
  const data = JSON.parse(json) as unknown;
  const list = isObj(data) && Array.isArray(data.songs) ? data.songs : isObj(data) ? [data] : arr(data);
  return list.map((s) => ({ ...normalizeSong(s), id: newId() }));
}
