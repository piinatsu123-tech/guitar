import { describe, expect, it } from "vitest";
import { createEmptySong } from "../../model/factory";
import type { Song } from "../../model/types";
import { GistClient, parseSyncData, serializeSyncData, SYNC_FILENAME } from "../gist";
import { fingerprint, isUntouchedSample, mergeLibraries, type SyncData } from "../merge";
import { syncOnce, type SyncBackend } from "../sync";

const song = (id: string, updatedAt: string, title = id): Song => ({
  ...createEmptySong(title),
  id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
});
const T = (h: number) => `2026-10-14T${String(h).padStart(2, "0")}:00:00.000Z`;
const ids = (d: SyncData) => d.songs.map((s) => `${s.id}:${s.title}`);

describe("mergeLibraries（曲ごとに新しい方、削除は時刻で判断）", () => {
  it("片方にしかない曲は両方に入る", () => {
    const m = mergeLibraries({ songs: [song("a", T(1))], deleted: [] }, { songs: [song("b", T(1))], deleted: [] });
    expect(ids(m)).toEqual(["a:a", "b:b"]);
  });

  it("同じ曲は更新時刻の新しい方", () => {
    const m = mergeLibraries(
      { songs: [song("a", T(2), "手元の新しい版")], deleted: [] },
      { songs: [song("a", T(1), "古い版")], deleted: [] },
    );
    expect(ids(m)).toEqual(["a:手元の新しい版"]);
    const m2 = mergeLibraries(
      { songs: [song("a", T(1), "古い版")], deleted: [] },
      { songs: [song("a", T(3), "別端末の新しい版")], deleted: [] },
    );
    expect(ids(m2)).toEqual(["a:別端末の新しい版"]);
  });

  it("削除は伝わる。削除より後に編集されていれば残す", () => {
    const m = mergeLibraries(
      { songs: [], deleted: [{ id: "a", at: T(2) }] },
      { songs: [song("a", T(1))], deleted: [] },
    );
    expect(m.songs).toEqual([]);
    expect(m.deleted).toEqual([{ id: "a", at: T(2) }]);
    const m2 = mergeLibraries(
      { songs: [], deleted: [{ id: "a", at: T(2) }] },
      { songs: [song("a", T(3))], deleted: [] },
    );
    expect(ids(m2)).toEqual(["a:a"]);
    expect(m2.deleted).toEqual([]);
  });

  it("統合は何度やっても同じ（指紋が一致）", () => {
    const a = { songs: [song("a", T(1)), song("c", T(4))], deleted: [{ id: "x", at: T(1) }] };
    const b = { songs: [song("b", T(2)), song("c", T(3))], deleted: [{ id: "a", at: T(5) }] };
    const m = mergeLibraries(a, b);
    expect(fingerprint(mergeLibraries(m, b))).toBe(fingerprint(m));
    expect(fingerprint(mergeLibraries(b, a))).toBe(fingerprint(m));
  });

  it("未編集のサンプル曲の判定", () => {
    expect(isUntouchedSample({ ...song("s", T(1), "S"), createdAt: T(1) }, "S")).toBe(true);
    expect(isUntouchedSample(song("s", T(2), "S"), "S")).toBe(false);
  });
});

describe("syncOnce", () => {
  const memory = () => {
    const gists = new Map<string, SyncData>();
    const calls: string[] = [];
    const backend: SyncBackend = {
      find: async () => (calls.push("find"), [...gists.keys()][0]),
      read: async (id) => (calls.push("read"), gists.get(id) ?? null),
      create: async (d) => (calls.push("create"), gists.set("g1", d), "g1"),
      update: async (id, d) => void (calls.push("update"), gists.set(id, d)),
    };
    return { gists, calls, backend };
  };

  it("初回は Gist を作る。2台目は見つけて取り込む。変化がなければ書かない", async () => {
    const { gists, calls, backend } = memory();
    const r1 = await syncOnce(backend, undefined, { songs: [song("a", T(1))], deleted: [] });
    expect(r1).toMatchObject({ gistId: "g1", pushed: true });
    const r2 = await syncOnce(backend, undefined, { songs: [song("b", T(1))], deleted: [] });
    expect(ids(r2.merged)).toEqual(["b:b", "a:a"]);
    expect(r2.pushed).toBe(true);
    expect(ids(gists.get("g1")!)).toEqual(["b:b", "a:a"]);
    calls.length = 0;
    const r3 = await syncOnce(backend, "g1", r2.merged);
    expect(r3.pushed).toBe(false);
    expect(calls).toEqual(["read"]);
  });
});

describe("GistClient", () => {
  it("同期ファイルの読み書きと 401", async () => {
    const data: SyncData = { songs: [song("a", T(1))], deleted: [{ id: "z", at: T(1) }] };
    const requests: { url: string; method: string; auth: string }[] = [];
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        auth: (init.headers as Record<string, string>).Authorization,
      });
      if (url.endsWith("/gists?per_page=100&page=1"))
        return Response.json([
          { id: "other", files: { "x.txt": {} } },
          { id: "g9", files: { [SYNC_FILENAME]: {} } },
        ]);
      if (url.endsWith("/gists/g9"))
        return Response.json({ id: "g9", files: { [SYNC_FILENAME]: { content: serializeSyncData(data) } } });
      return new Response("", { status: 401 });
    }) as typeof fetch;
    const c = new GistClient("tok", fetchFn);
    expect(await c.find()).toBe("g9");
    const read = await c.read("g9");
    expect(ids(read!)).toEqual(["a:a"]);
    expect(read!.deleted).toEqual([{ id: "z", at: T(1) }]);
    expect(requests.every((r) => r.auth === "Bearer tok")).toBe(true);
    await expect(c.user()).rejects.toThrow(/トークンが無効/);
  });

  it("別形式のファイルは拒否", () => {
    expect(() => parseSyncData(JSON.stringify({ songs: [] }))).toThrow(/形式/);
  });
});
