// 1回分の同期：Gist を読み、手元と統合し、変わっていれば書き戻す。
import { fingerprint, mergeLibraries, type SyncData } from "./merge";

export type SyncBackend = {
  find(): Promise<string | undefined>;
  read(id: string): Promise<SyncData | null>;
  create(data: SyncData): Promise<string>;
  update(id: string, data: SyncData): Promise<void>;
};

export type SyncResult = { gistId: string; merged: SyncData; pushed: boolean };

export async function syncOnce(backend: SyncBackend, gistId: string | undefined, local: SyncData): Promise<SyncResult> {
  let id = gistId;
  let remote: SyncData | null = null;
  if (id) {
    remote = await backend.read(id);
    if (!remote) id = undefined; // Gist が消されていたら探し直す
  }
  if (!id) {
    id = await backend.find();
    if (id) remote = await backend.read(id);
  }
  const merged = remote ? mergeLibraries(local, remote) : local;
  if (!id || !remote) {
    const created = await backend.create(merged);
    return { gistId: created, merged, pushed: true };
  }
  const pushed = fingerprint(merged) !== fingerprint(remote);
  if (pushed) await backend.update(id, merged);
  return { gistId: id, merged, pushed };
}

// ---- この端末の同期設定（トークンは端末ごと。曲データとは別に保存） ----

export const SYNC_CONFIG_KEY = "guitar-player/sync";
export type SyncConfig = { token: string; login: string; gistId?: string; lastSyncAt?: string };

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SyncConfig;
    return typeof v.token === "string" && v.token ? v : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig | null): void {
  try {
    if (config) localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(SYNC_CONFIG_KEY);
  } catch {
    // 保存できなくても同期そのものは続ける
  }
}
