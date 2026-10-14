// GitHub Gist を同期先にするクライアント。非公開（secret）Gist の1ファイルにライブラリを保存する。
// トークンは gist 権限だけのものを使い、この端末のブラウザ内にだけ保存する。
import { normalizeSong, SCHEMA_VERSION } from "../storage/repository";
import type { SyncData, Tombstone } from "./merge";

export const SYNC_FILENAME = "guitar-player-sync.json";
const API = "https://api.github.com";

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type GistFile = { content?: string; truncated?: boolean; raw_url?: string };
type Gist = { id: string; files: Record<string, GistFile> };

export function serializeSyncData(data: SyncData): string {
  return JSON.stringify({
    format: "guitar-player-sync",
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    songs: data.songs,
    deleted: data.deleted,
  });
}

export function parseSyncData(text: string): SyncData {
  const v = JSON.parse(text) as Record<string, unknown>;
  if (typeof v !== "object" || v === null || v.format !== "guitar-player-sync")
    throw new SyncError("同期ファイルの形式が正しくありません");
  if (typeof v.schemaVersion === "number" && v.schemaVersion > SCHEMA_VERSION)
    throw new SyncError("ほかの端末が新しいバージョンのアプリで保存しています。ページを再読み込みしてください");
  const songs = Array.isArray(v.songs) ? v.songs.map(normalizeSong) : [];
  const deleted: Tombstone[] = Array.isArray(v.deleted)
    ? v.deleted.filter(
        (t): t is Tombstone =>
          typeof t === "object" && t !== null && typeof t.id === "string" && typeof t.at === "string",
      )
    : [];
  return { songs, deleted };
}

export class GistClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch {
      throw new SyncError("GitHub に接続できません（オフラインかもしれません）");
    }
    if (res.status === 401) throw new SyncError("トークンが無効か期限切れです。作り直して接続し直してください", 401);
    if (res.status === 403 || res.status === 429)
      throw new SyncError("GitHub に拒否されました（トークンに gist の権限がないか、回数制限です）", res.status);
    if (!res.ok) throw new SyncError(`GitHub のエラー（${res.status}）`, res.status);
    return (await res.json()) as T;
  }

  /** トークンの持ち主（接続の確認用） */
  async user(): Promise<string> {
    const u = await this.request<{ login: string }>("/user");
    return u.login;
  }

  /** 同期ファイルを持つ Gist を探す */
  async find(): Promise<string | undefined> {
    for (let page = 1; page <= 10; page++) {
      const list = await this.request<Gist[]>(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.files && SYNC_FILENAME in g.files);
      if (hit) return hit.id;
      if (list.length < 100) return undefined;
    }
    return undefined;
  }

  /** Gist の同期ファイルを読む（Gist がなければ null） */
  async read(id: string): Promise<SyncData | null> {
    let gist: Gist;
    try {
      gist = await this.request<Gist>(`/gists/${id}`);
    } catch (e) {
      if (e instanceof SyncError && e.status === 404) return null;
      throw e;
    }
    const file = gist.files?.[SYNC_FILENAME];
    if (!file) return null;
    let text = file.content ?? "";
    if (file.truncated && file.raw_url) {
      const res = await this.fetchFn(file.raw_url, { cache: "no-store" });
      if (!res.ok) throw new SyncError(`同期ファイルを読めません（${res.status}）`, res.status);
      text = await res.text();
    }
    return parseSyncData(text);
  }

  async create(data: SyncData): Promise<string> {
    const gist = await this.request<Gist>("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: "ギター演奏ノートの同期データ（アプリが自動で更新します）",
        public: false,
        files: { [SYNC_FILENAME]: { content: serializeSyncData(data) } },
      }),
    });
    return gist.id;
  }

  async update(id: string, data: SyncData): Promise<void> {
    await this.request<Gist>(`/gists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ files: { [SYNC_FILENAME]: { content: serializeSyncData(data) } } }),
    });
  }
}
