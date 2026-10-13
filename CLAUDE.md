# 開発メモ（このリポジトリで作業するとき）

- **変更のたびにバージョンを上げる**：`package.json` の `version` を上げ（機能追加はマイナー、修正はパッチ）、`CHANGELOG.md` に日本語で追記する。バージョンはビルド時に `vite.config.ts` から埋め込まれ、アプリに表示される。
- 確認手順（push 前にすべて通す）：
  - `npx tsc -p .`
  - `npm test`（ユニットテスト）
  - `npm run build && npm run e2e`（Chromium で受け入れテスト）
  - 音声に関わる変更は `npm run e2e:audio`（実ブラウザでオフライン描画した音を測る）
- 音高計算・時間軸・再生スケジュールは UI から独立した純粋関数（`src/music`, `src/audio/schedule.ts`, `src/audio/synth.ts`）に置き、単体テストする。
- `claude/guitar-player-app`（既定ブランチ）へ push すると GitHub Pages に自動公開される。
