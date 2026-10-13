# ギター演奏ノート

ギターの指板上の音名を覚えながら、曲のコード進行・リズム・歌詞を一画面で見て演奏するための Web アプリです（React + TypeScript + Vite）。サーバー不要で、データはブラウザの localStorage に保存されます。

## 使い方

```bash
npm install
npm run dev        # 開発サーバー
npm test           # ユニットテスト（音高計算・コード判定・フォーム生成・時間軸・歌詞・保存）
npm run build      # 型チェック + 本番ビルド（dist/）
npm run e2e        # 受け入れテスト（build 後に実行。Chromium で実際に操作して確認）
```

## 機能

- **演奏画面**: 曲全体のコード進行（セクション・小節）、選択中コードの TAB 譜／指板（音名付き）とピアノ鍵盤（実音）、リズム（音符・ストローク・拍目盛り）と歌詞を共通の時間軸で表示。前後のコードへの移動（ボタン・← → キー）。歌詞の文字をタップすると「この位置で弾く」マークを付け外し。
- **編集画面**: 曲名・テンポ・拍子／セクションとコード進行（`| C | G | Am Em |` 形式の一括入力も可）／コードフォーム（自動生成候補から選択・指板タップで手動入力・構成音チェック）／リズムパターン（ステップ編集）／歌詞とタイミング。編集は下書きに対して行い「保存」で反映。
- **表示設定**: TAB・鍵盤・リズム・歌詞の表示切替、TAB と鍵盤それぞれの音名表記（ドレミ／ABC／非表示）。即時反映・保存。
- **保存**: 複数曲の保存、JSON 書き出し・読み込み。

## 設計メモ

| 場所 | 内容 |
| --- | --- |
| `src/music/pitch.ts` | 音高計算（MIDI 番号。C4 = 60、標準チューニング E2 A2 D3 G3 B3 E4）と音名表記。TAB と鍵盤は同じ関数を使う |
| `src/music/chord.ts` | コード名の解析（種類は `CHORD_QUALITIES` に追加するだけで拡張可能）、フォームの発音音高と検証 |
| `src/music/formGenerator.ts` | フォーム自動生成（候補列挙 → コード成立の検証 → 押さえにくい候補の除外 → スコア順） |
| `src/music/timeline.ts` | 時間軸。**4分音符 = 12 tick**（16分 = 3、8分 = 6、3連8分 = 4）。1小節 = 分子 × 48 / 分母 tick |
| `src/music/arrangement.ts` | 小節ごとにコード・リズム・歌詞を小節内 tick で揃えた表示データを作る |
| `src/music/lyrics.ts` | 歌詞の書記素分割、編集時の ID・位置・マークの引き継ぎ |
| `src/model/` | データモデル・生成・整合性を保つ更新操作 |
| `src/storage/repository.ts` | バージョン付き保存形式と正規化（インポートも同じ検証を通す） |

仕様書のデータモデルからの主な変更点:

- `Section` は `measures` ではなく `chords`（各コードが `durationTicks` を持つ）。小節への分割は表示時に計算するため、小節をまたぐコードも表現できる。
- `RhythmEvent` は音符の種類（notation）を保存せず、`durationTicks` から導出する（長さと表記の食い違いを防ぐ）。`kind: "note" | "rest"` と `guitarAction` を独立に持ち、「音符はあるが弾かない（伸ばす）」と「休符」を区別する。`guitarAction` にブラッシング（`mute`）を追加。
- リズムパターンは曲ごとのライブラリで、コード → セクション → 曲の既定 の順に解決。パターンは小節頭基準で敷き詰める。
- 歌詞の `startTick` はコードの開始位置からの相対位置。文字ごとに永続 ID を持つ。
- 表示設定は曲ごとではなく全曲共通で保存する。
- コード名と保存フォームのコード名が一致しない場合は保存フォームを使わず自動生成に戻す（古い TAB が残らない）。

## 公開（GitHub Pages）

`.github/workflows/deploy.yml` が、`main` または `claude/guitar-player-app` への push でテスト・ビルドを行い GitHub Pages に公開します。
初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください。
公開 URL: https://piinatsu123-tech.github.io/guitar/
