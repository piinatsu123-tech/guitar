import { describe, expect, it } from "vitest";
import { createSampleSong } from "../../model/factory";
import { DEFAULT_SETTINGS } from "../../model/types";
import { exportSongs, importSongs, loadState, normalizeSong, saveState, type KeyValueStore } from "../repository";

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("保存と読み込み", () => {
  it("保存して再読み込みしても内容が維持される", () => {
    const store = memoryStore();
    const song = createSampleSong();
    song.sections[0].chords[0].lyrics[2].accentMarked = true;
    const settings = { ...DEFAULT_SETTINGS, showPiano: false, tabLabelMode: "abc" as const };
    saveState({ schemaVersion: 1, songs: [song], settings, lastSongId: song.id }, store);
    const loaded = loadState(store)!;
    expect(loaded.songs[0]).toEqual(song);
    expect(loaded.settings).toEqual(settings);
    expect(loaded.lastSongId).toBe(song.id);
  });

  it("壊れたデータは null", () => {
    const store = memoryStore();
    store.setItem("guitar-player/v1", "{oops");
    expect(loadState(store)).toBeNull();
  });

  it("不正な値は正規化される（存在しないフォーム参照・範囲外の位置）", () => {
    const song = createSampleSong();
    const raw = JSON.parse(JSON.stringify(song));
    raw.sections[0].chords[0].formId = "missing";
    raw.sections[0].chords[0].lyrics[0].startTick = 9999;
    raw.timeSignature = { numerator: 4, denominator: 3 };
    const n = normalizeSong(raw);
    expect(n.sections[0].chords[0].formId).toBeUndefined();
    expect(n.sections[0].chords[0].lyrics[0].startTick).toBe(n.sections[0].chords[0].durationTicks - 1);
    expect(n.timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });

  it("JSON エクスポート → インポート", () => {
    const song = createSampleSong();
    const [imported] = importSongs(exportSongs([song]));
    expect(imported.id).not.toBe(song.id);
    expect({ ...imported, id: song.id }).toEqual(song);
  });
});
