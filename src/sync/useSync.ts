import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../storage/repository";
import { createSampleSong } from "../model/factory";
import { GistClient } from "./gist";
import { fingerprint, isUntouchedSample, mergeLibraries, type SyncData } from "./merge";
import { loadSyncConfig, saveSyncConfig, syncOnce, type SyncConfig } from "./sync";

export type SyncStatus =
  | { kind: "off" }
  | { kind: "syncing" }
  | { kind: "ok"; at: string }
  | { kind: "error"; message: string };

/** 変更してから同期するまでの待ち時間（続けて編集している間は送らない） */
const DEBOUNCE_MS = 3000;
const SAMPLE_TITLE = createSampleSong().title;

const dataOf = (st: AppState): SyncData => ({ songs: st.songs, deleted: st.deleted ?? [] });

/**
 * GitHub Gist との自動同期。接続中は、開いたとき・画面に戻ったとき・曲を変更して少し経ったときに同期する。
 */
export function useSync(state: AppState, setState: (fn: (st: AppState) => AppState) => void) {
  const [config, setConfig] = useState<SyncConfig | null>(loadSyncConfig);
  const [status, setStatus] = useState<SyncStatus>(() => (config ? { kind: "syncing" } : { kind: "off" }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const configRef = useRef(config);
  configRef.current = config;
  const running = useRef(false);
  const again = useRef(false);
  const lastSynced = useRef<string | null>(null);

  const updateConfig = (next: SyncConfig | null) => {
    configRef.current = next;
    setConfig(next);
    saveSyncConfig(next);
  };

  const run = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus({ kind: "syncing" });
    try {
      let local = dataOf(stateRef.current);
      const client = new GistClient(cfg.token);
      const dropped = new Set<string>();
      if (!cfg.gistId && (await client.find())) {
        // 初めてつなぐ端末で同期データがすでにあるとき、まだ触っていないサンプル曲は持ち込まない（端末ごとに重複するため）
        for (const s of local.songs) if (isUntouchedSample(s, SAMPLE_TITLE)) dropped.add(s.id);
        local = { ...local, songs: local.songs.filter((s) => !dropped.has(s.id)) };
      }
      const result = await syncOnce(client, cfg.gistId, local);
      if (configRef.current?.token !== cfg.token) return; // 途中で解除された
      lastSynced.current = fingerprint(result.merged);
      // 同期中に手元で変えた分も残すため、今の状態ともう一度統合する
      setState((st) => {
        const base = dataOf(st);
        const merged = mergeLibraries({ ...base, songs: base.songs.filter((s) => !dropped.has(s.id)) }, result.merged);
        return fingerprint(merged) === fingerprint(base) ? st : { ...st, songs: merged.songs, deleted: merged.deleted };
      });
      const at = new Date().toISOString();
      updateConfig({ ...cfg, gistId: result.gistId, lastSyncAt: at });
      setStatus({ kind: "ok", at });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void run();
      }
    }
  }, [setState]);

  // 開いたとき・接続したとき
  useEffect(() => {
    if (config) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.token]);

  // 曲を変えたら少し待って同期
  const localPrint = fingerprint(dataOf(state));
  useEffect(() => {
    if (!config || localPrint === lastSynced.current) return;
    const t = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [localPrint, config, run]);

  // ほかのアプリから戻ってきたとき（別の端末で変えたものを取り込む）
  useEffect(() => {
    if (!config) return;
    const onVisible = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [config, run]);

  /** トークンを確かめて接続する */
  const connect = async (token: string) => {
    const login = await new GistClient(token.trim()).user();
    lastSynced.current = null;
    updateConfig({ token: token.trim(), login });
  };
  const disconnect = () => {
    updateConfig(null);
    setStatus({ kind: "off" });
  };

  return { config, status, connect, disconnect, syncNow: run };
}
