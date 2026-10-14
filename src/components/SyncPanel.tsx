import { useState } from "react";
import type { SyncStatus } from "../sync/useSync";
import type { SyncConfig } from "../sync/sync";

type Props = {
  config: SyncConfig | null;
  status: SyncStatus;
  onConnect: (token: string) => Promise<void>;
  onDisconnect: () => void;
  onSyncNow: () => void;
};

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=gist&description=%E3%82%AE%E3%82%BF%E3%83%BC%E6%BC%94%E5%A5%8F%E3%83%8E%E3%83%BC%E3%83%88%E3%81%AE%E5%90%8C%E6%9C%9F";

export function syncStatusText(status: SyncStatus): string {
  switch (status.kind) {
    case "off":
      return "同期していません";
    case "syncing":
      return "同期中…";
    case "ok":
      return `同期済み（${new Date(status.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）`;
    case "error":
      return `同期できませんでした: ${status.message}`;
  }
}

/** 端末間同期（GitHub Gist）の接続と状態 */
export function SyncPanel({ config, status, onConnect, onDisconnect, onSyncNow }: Props) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (config) {
    return (
      <div className="card sync-panel" role="region" aria-label="端末間の同期">
        <h2 className="card-title">端末間の同期（GitHub: {config.login}）</h2>
        <p className={`small ${status.kind === "error" ? "warn" : "muted"}`} role="status">
          {syncStatusText(status)}
        </p>
        <p className="muted small">
          曲を変えると数秒後に自動で同期します。アプリを開いたときや、ほかのアプリから戻ったときにも、ほかの端末の変更を取り込みます。
          同じ曲を2台で同時に変えたときは、あとから変えた方が残ります。
        </p>
        <div className="btn-row">
          <button type="button" className="small-btn primary" onClick={onSyncNow} disabled={status.kind === "syncing"}>
            今すぐ同期
          </button>
          <button
            type="button"
            className="small-btn"
            onClick={() =>
              window.confirm("この端末の同期をやめますか？（曲はこの端末にも GitHub にも残ります）") && onDisconnect()
            }
          >
            この端末の同期をやめる
          </button>
        </div>
      </div>
    );
  }

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConnect(token);
      setToken("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card sync-panel" role="region" aria-label="端末間の同期">
      <h2 className="card-title">端末間の同期（GitHub）</h2>
      <p className="small">
        GitHub アカウントの非公開の Gist に曲を保存して、iPad・パソコンなどほかの端末と同期します。無料です。
        同期したい端末それぞれで、1回だけ次の設定をします。
      </p>
      <ol className="small sync-steps">
        <li>
          <a href={TOKEN_URL} target="_blank" rel="noreferrer">
            GitHub のトークン作成ページ
          </a>
          を開く（「gist」にだけチェックが入った状態で開きます）。
        </li>
        <li>Expiration（有効期限）を選び、いちばん下の「Generate token」を押す。</li>
        <li>表示された ghp_ で始まる文字列をコピーして、下に貼り付ける。</li>
      </ol>
      <div className="btn-row">
        <input
          type="password"
          className="sync-token"
          aria-label="GitHub のトークン"
          placeholder="ghp_..."
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && token.trim() && void connect()}
        />
        <button type="button" className="small-btn primary" onClick={connect} disabled={!token.trim() || busy}>
          {busy ? "確認中…" : "接続して同期"}
        </button>
      </div>
      {error && (
        <p className="warn small" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">
        トークンはこの端末のブラウザの中にだけ保存し、GitHub 以外には送りません。gist
        の権限しかないので、リポジトリなどほかのものには触れません。
      </p>
    </div>
  );
}
