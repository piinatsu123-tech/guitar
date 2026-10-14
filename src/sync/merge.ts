// 端末間同期の統合ルール（純粋関数）。
// 曲ごとに updatedAt が新しい方を採用する。削除は「削除した時刻」の印（tombstone）で伝え、
// 削除のあとに編集されていなければ削除を優先する。
import type { Song } from "../model/types";

export type Tombstone = { id: string; at: string };
export type SyncData = { songs: Song[]; deleted: Tombstone[] };

/** 二つのライブラリを統合する。並び順は local を先に、remote にしかない曲を後ろに */
export function mergeLibraries(local: SyncData, remote: SyncData): SyncData {
  const tomb = new Map<string, string>();
  for (const t of [...local.deleted, ...remote.deleted]) {
    const cur = tomb.get(t.id);
    if (cur === undefined || cur < t.at) tomb.set(t.id, t.at);
  }
  const songs = new Map<string, Song>();
  for (const s of [...local.songs, ...remote.songs]) {
    const cur = songs.get(s.id);
    if (!cur || cur.updatedAt < s.updatedAt) songs.set(s.id, s);
  }
  const kept = [...songs.values()].filter((s) => {
    const at = tomb.get(s.id);
    return at === undefined || at < s.updatedAt;
  });
  const keptIds = new Set(kept.map((s) => s.id));
  const deleted = [...tomb]
    .filter(([id]) => !keptIds.has(id)) // 削除後に編集された曲は復活させ、印は捨てる
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { songs: kept, deleted };
}

/** 内容が同じかを見るための指紋（曲 ID と更新時刻、削除の印） */
export function fingerprint(data: SyncData): string {
  const songs = data.songs.map((s) => `${s.id}@${s.updatedAt}`).sort();
  const deleted = data.deleted.map((t) => `${t.id}@${t.at}`).sort();
  return `${songs.join(",")}|${deleted.join(",")}`;
}

/** 一度も編集していないサンプル曲（初めて同期するとき、端末ごとに重複しないよう捨てる） */
export function isUntouchedSample(song: Song, sampleTitle: string): boolean {
  return song.title === sampleTitle && song.createdAt === song.updatedAt;
}
