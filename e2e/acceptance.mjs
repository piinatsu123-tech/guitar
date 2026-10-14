// 受け入れテスト（仕様書 15章）を実ブラウザで確認する。
// 使い方: npm run build && npm run e2e
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

import net from "node:net";

// 空いているポートを使う（前回の実行が残っていても衝突しない）
const PORT = await new Promise((resolve) => {
  const srv = net.createServer().listen(0, () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});
const URL = `http://localhost:${PORT}/`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort"],
  { stdio: "pipe" },
);
const stopServer = () => server.exitCode === null && server.kill();
process.on("exit", stopServer);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("Local") && resolve());
  server.on("exit", (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error("preview timeout")), 15000);
});

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["✓", name]);
  } catch (e) {
    results.push(["✗", name, e.message.split("\n").filter(Boolean).slice(0, 30).join(" ")]);
  }
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();

// 録音が始まった瞬間から、ページ内で正確な間隔でキーを押す
async function tapAlong(offsetsSec, keys, waitText = "録音中") {
  await page.evaluate(
    ({ offsetsSec, keys, waitText }) =>
      new Promise((resolve) => {
        const status = document.querySelector(".tap-status");
        const go = () => {
          offsetsSec.forEach((t, i) =>
            setTimeout(
              // 実際のキー入力と同じく、ページ（body）から window へ伝わるイベントにする
              () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: keys?.[i] ?? " ", bubbles: true })),
              t * 1000,
            ),
          );
          setTimeout(resolve, offsetsSec[offsetsSec.length - 1] * 1000 + 50);
        };
        const obs = new MutationObserver(() => {
          if (status.textContent.includes(waitText)) {
            obs.disconnect();
            go();
          }
        });
        obs.observe(status, { childList: true, subtree: true, characterData: true });
      }),
    { offsetsSec, keys, waitText },
  );
}

// 人と同じように1文字ずつ打つ（fill は値を一度に入れるので、途中の値で起きる不具合を見逃す）
async function typeLikeHuman(locator, text) {
  await locator.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  for (const ch of text) await page.keyboard.type(ch, { delay: 20 });
  await page.keyboard.press("Enter");
}

// ---- 画面の操作 ----
const startEdit = () => page.getByRole("button", { name: "✎ 編集" }).click();
const endEdit = () => page.getByRole("button", { name: "✓ 編集を終える" }).click();
const section = (name) => page.locator(`.lyric-sheet section[aria-label="${name}"]`);
/** コードのかたまり（コード名:そのコードの歌詞） */
const segs = async (name) => {
  const out = [];
  for (const sg of await section(name).locator(".sheet-seg.has-chord").all()) {
    const chords = (await sg.locator(".sheet-chord").allTextContents()).join("+");
    out.push(`${chords}:${(await sg.locator(".sheet-char").allTextContents()).join("")}`);
  }
  return out;
};
const cell = (name, ch, nth = 0) =>
  section(name)
    .getByRole("button", { name: new RegExp(`^「${ch}」`) })
    .nth(nth);
const panel = () => page.locator(".sheet-panel");
const undoAll = () => page.getByRole("button", { name: "元に戻す", exact: true }).click();
/** TAB 図の説明に、指定のフレット（6弦→1弦、null はミュート）がすべて含まれる */
const describes = (label, frets) =>
  frets.every((f, i) => label.includes(`${6 - i}弦${f === null ? "ミュート" : f === 0 ? "開放" : `${f}フレット`}`));

await check("演奏画面: 歌詞の上にコード名とコード図（Aメロ 1行目 = C あさのひかりが / G まどをたたく）", async () => {
  assert.deepEqual((await segs("Aメロ")).slice(0, 2), ["C:あさのひかりが", "G:まどをたたく"]);
  assert.equal(await section("Aメロ").locator(".sheet-line").count(), 4);
  assert.equal(await section("Aメロ").locator(".sheet-diagram").count(), 8);
  const g = await section("Aメロ")
    .locator(".sheet-seg.has-chord")
    .nth(1)
    .locator(".tab-view")
    .getAttribute("aria-label");
  assert.ok(describes(g, [3, 2, 0, 0, 0, 3]), g);
  // 見るだけのときは文字はボタンではない（誤タップで変わらない）
  assert.equal(await section("Aメロ").getByRole("button", { name: /^「/ }).count(), 0);
  // 古い譜面表示はない
  assert.equal(await page.locator(".score, .progression, .tl-diagram").count(), 0);
});

await check("表示: コード図をオフにすると名前だけ。再読み込み後も維持", async () => {
  await page.getByRole("button", { name: "表示" }).click();
  await page.getByLabel("コード図", { exact: true }).uncheck();
  assert.equal(await page.locator(".sheet-diagram").count(), 0);
  assert.deepEqual((await segs("Aメロ")).slice(0, 1), ["C:あさのひかりが"]);
  await page.reload();
  assert.equal(await page.locator(".sheet-diagram").count(), 0);
  await page.getByRole("button", { name: "表示" }).click();
  await page.getByLabel("コード図", { exact: true }).check();
  assert.ok((await page.locator(".sheet-diagram").count()) > 0);
  await page.getByRole("button", { name: "表示" }).click();
});

await check("リズム譜: セクションに表示され、▶ で頭から1回だけ鳴って止まる（くり返さない）", async () => {
  const r = page.getByRole("region", { name: "Aメロのリズム" });
  assert.ok((await r.locator(".rhythm-staff .tl-measure").count()) >= 1);
  assert.ok((await r.locator(".tl-stroke").count()) >= 1);
  // 歌詞の下に置く（セクションの最後の行より下）
  const lastLine = await section("Aメロ").locator(".sheet-line").last().boundingBox();
  const staff = await r.boundingBox();
  assert.ok(staff.y >= lastLine.y + lastLine.height - 1, JSON.stringify([lastLine, staff]));
  // リズム譜のないセクションには、見るだけのときは何も出ない
  assert.equal(await page.getByRole("region", { name: "Bメロのリズム" }).count(), 0);
  const bars = await r.locator(".rhythm-staff .tl-measure").count();
  await r.getByRole("button", { name: "▶ リズムを聴く" }).click();
  await r.getByRole("button", { name: "■ 停止" }).waitFor();
  // ♩=96 で1小節 2.5秒。終わったら自分で止まる
  await r.getByRole("button", { name: "▶ リズムを聴く" }).waitFor({ timeout: bars * 2500 + 2000 });
  await r.getByRole("button", { name: "▶ リズムを聴く" }).click();
  await r.getByRole("button", { name: "■ 停止" }).click();
  await r.getByRole("button", { name: "▶ リズムを聴く" }).waitFor();
});

await check("編集: 文字をタップしてコードを置く・取り除く（Aメロ「ひ」に Am）", async () => {
  await startEdit();
  await cell("Aメロ", "ひ").click();
  await panel().getByRole("group", { name: "この曲のコード" }).getByRole("button", { name: "Am", exact: true }).click();
  await endEdit();
  assert.deepEqual((await segs("Aメロ")).slice(0, 3), ["C:あさの", "Am:ひかりが", "G:まどをたたく"]);
  await startEdit();
  await cell("Aメロ", "ひ").click();
  await panel().getByRole("button", { name: "取り除く" }).click();
  await endEdit();
  assert.deepEqual((await segs("Aメロ")).slice(0, 2), ["C:あさのひかりが", "G:まどをたたく"]);
});

await check("編集: 行の歌詞を直しても、コードは同じ文字の上に残る。元に戻せる", async () => {
  await startEdit();
  await section("Aメロ").getByRole("button", { name: "この行の歌詞を直す" }).first().click();
  await page.getByRole("textbox", { name: "この行の歌詞" }).fill("あさのひかりがまどをそっとたたく");
  await page.getByRole("textbox", { name: "この行の歌詞" }).press("Enter");
  assert.deepEqual((await segs("Aメロ")).slice(0, 2), ["C:あさのひかりが", "G:まどをそっとたたく"]);
  await undoAll();
  assert.deepEqual((await segs("Aメロ")).slice(0, 2), ["C:あさのひかりが", "G:まどをたたく"]);
  // セクション名も変えられる
  await page.getByLabel("セクション名").first().fill("1番Aメロ");
  await page.getByLabel("セクション名").first().press("Enter");
  assert.equal(await section("1番Aメロ").count(), 1);
  await undoAll();
  await endEdit();
  assert.equal(await section("Aメロ").count(), 1);
});

await check("コードフォーム: 候補を選んで保存すると、歌詞の上のコード図が変わる（再読み込み後も）", async () => {
  await page.getByRole("button", { name: "コードフォーム" }).click();
  await page.getByRole("radiogroup", { name: "コード名" }).getByRole("radio", { name: "G", exact: true }).click();
  await page.getByRole("button", { name: /^候補2 / }).click();
  const frets = [];
  for (const s of [6, 5, 4, 3, 2, 1]) {
    const v = await page.getByLabel(`${s}弦のフレット（x でミュート）`).inputValue();
    frets.push(v === "x" ? null : Number(v));
  }
  await page.getByRole("button", { name: "このフォームを使う" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
  const label = () =>
    section("Aメロ").locator(".sheet-seg.has-chord").nth(1).locator(".tab-view").getAttribute("aria-label");
  assert.ok(describes(await label(), frets), `${await label()} / ${frets}`);
  await page.reload();
  assert.ok(describes(await label(), frets));
});

await check("新しい曲: 歌詞を貼り付けて、文字にコードを置くとそのまま曲になる", async () => {
  await page.getByRole("button", { name: "曲一覧へ戻る" }).click();
  await page.getByRole("button", { name: "＋ 新しい曲" }).click();
  await page.getByLabel("貼り付ける歌詞").fill("[Aメロ]\nあさのひかり まどをたたく\n\n[サビ]\nひかりのなかへ");
  await page.getByRole("button", { name: "シートにする" }).click();
  // 一覧から（ルート＋種類）
  await cell("Aメロ", "あ").click();
  await panel().getByRole("group", { name: "ルート" }).getByRole("button", { name: "C", exact: true }).click();
  await panel().getByRole("group", { name: "種類" }).getByRole("button", { name: "メジャー" }).click();
  // 入力欄から
  await cell("Aメロ", "ま").click();
  await panel().getByLabel("コード名を入力").fill("G");
  await panel().getByLabel("コード名を入力").press("Enter");
  // 行末に歌詞のないコードを2つ重ねて置き、1つだけ取り除く
  await section("Aメロ").getByRole("button", { name: /^行末/ }).click();
  await panel().getByLabel("コード名を入力").fill("Am");
  await panel().getByLabel("コード名を入力").press("Enter");
  await panel().getByRole("radio", { name: "＋ もう1つ足す" }).click();
  await panel().getByLabel("コード名を入力").fill("D");
  await panel().getByLabel("コード名を入力").press("Enter");
  const here = panel().getByRole("radiogroup", { name: "この位置のコード" });
  assert.deepEqual(await here.getByRole("radio").allTextContents(), ["Am", "D", "＋ もう1つ足す"]);
  await here.getByRole("radio", { name: "Am", exact: true }).click();
  await panel().getByRole("button", { name: "「Am」を取り除く" }).click();
  assert.deepEqual(await here.getByRole("radio").allTextContents(), ["D", "＋ もう1つ足す"]);
  // パワーコードも置ける
  await cell("サビ", "ひ").click();
  await panel().getByLabel("コード名を入力").fill("E5");
  await panel().getByLabel("コード名を入力").press("Enter");
  await endEdit();
  assert.deepEqual(await segs("Aメロ"), ["C:あさのひかり ", "G:まどをたたく", "D:"]);
  assert.deepEqual(await segs("サビ"), ["E5:ひかりのなかへ"]);
  await page.reload();
  assert.deepEqual(await segs("Aメロ"), ["C:あさのひかり ", "G:まどをたたく", "D:"]);
});

await check("コードフォーム: パワーコード（E5 = 022xxx）を鍵盤のタップで編集できる", async () => {
  await page.getByRole("button", { name: "コードフォーム" }).click();
  await page.getByRole("radiogroup", { name: "コード名" }).getByRole("radio", { name: "E5", exact: true }).click();
  const fret = (s) => page.getByLabel(`${s}弦のフレット（x でミュート）`).inputValue();
  const frets = async () => Promise.all([6, 5, 4, 3, 2, 1].map(fret));
  assert.deepEqual(await frets(), ["0", "2", "2", "x", "x", "x"]);
  assert.match(await page.locator(".form-editor .analysis").first().textContent(), /✓ E5（パワーコード）/);
  // 鳴っていない E4 → 空いている1弦の開放
  await page.getByRole("button", { name: "鍵盤 E4" }).click();
  assert.deepEqual(await frets(), ["0", "2", "2", "x", "x", "0"]);
  // 鳴っている B2（5弦2F）→ その弦がミュート
  assert.equal(await page.getByRole("button", { name: "鍵盤 B2" }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "鍵盤 B2" }).click();
  assert.deepEqual(await frets(), ["0", "x", "2", "x", "x", "0"]);
  // 3度が入るとパワーコードではなくなる
  await page.getByRole("button", { name: "鍵盤 G♯3" }).click();
  assert.match(await page.locator(".form-editor .analysis").first().textContent(), /⚠/);
  // ギターで出せない音はボタンにならない
  assert.equal(await page.getByRole("button", { name: "鍵盤 D2" }).count(), 0);
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
});

const rhythmOf = (name) => page.getByRole("region", { name: `${name}のリズム` });
const stepCells = async (n) => {
  const steps = page.locator(".section-rhythm-editor .step");
  const cells = [];
  for (let i = 0; i < n; i++) {
    cells.push(
      (await steps.nth(i).locator(".step-state").textContent()) +
        (await steps.nth(i).locator(".step-action").textContent()),
    );
  }
  return cells;
};
const EIGHTHS_UPDOWN = ["♪↓", "♪↑", "♪↓", "♪↑", "♪↓", "♪↑", "♪↓", "♪↑"];
const TEMPO = 90; // 新しい曲のテンポ
const recordButton = () => page.locator(".section-rhythm-editor").getByRole("button", { name: "● 録音" });

await check("リズム譜を採譜: クリックに合わせた4分のタップ → 4分ダウン×4 がセクションに入る", async () => {
  await startEdit();
  await rhythmOf("サビ").getByRole("button", { name: "＋ リズムを採譜" }).click();
  await page.getByLabel("録音する長さ").selectOption("1");
  await recordButton().click();
  const q = 60 / TEMPO;
  await tapAlong([0, q, 2 * q, 3 * q]);
  await recordButton().waitFor({ timeout: 6000 });
  assert.equal(await page.locator(".section-rhythm-editor .step").count(), 8);
  assert.deepEqual(await stepCells(8), ["♪↓", "～", "♪↓", "～", "♪↓", "～", "♪↓", "～"]);
  assert.match(await page.locator(".tap-status").textContent(), /4個の音符を8分の細かさで入力しました/);
  await endEdit();
  const staff = rhythmOf("サビ").locator(".rhythm-staff");
  assert.equal(await staff.locator(".tl-measure").count(), 1);
  assert.deepEqual(await staff.locator(".tl-stroke").allTextContents(), ["↓", "↓", "↓", "↓"]);
  // コードとは切り離されている（コードは変わらない）
  assert.deepEqual(await segs("サビ"), ["E5:ひかりのなかへ"]);
});

await check("リズム譜を採譜: 裏拍は自動でアップ（↓ ↓↑ ・↑ ↓↑）、録音の「元に戻す」で戻る", async () => {
  await startEdit();
  await rhythmOf("サビ").getByRole("button", { name: "✎ リズムを直す" }).click();
  const e = 60 / TEMPO / 2;
  await recordButton().click();
  await tapAlong([0, 2 * e, 3 * e, 5 * e, 6 * e, 7 * e]);
  await recordButton().waitFor({ timeout: 6000 });
  assert.deepEqual(await stepCells(8), ["♪↓", "～", "♪↓", "♪↑", "～", "♪↑", "♪↓", "♪↑"]);
  await page.locator(".tap-recorder").getByRole("button", { name: "元に戻す" }).click();
  assert.deepEqual(await stepCells(8), ["♪↓", "～", "♪↓", "～", "♪↓", "～", "♪↓", "～"]);
});

await check("リズム譜を採譜: 2小節まとめて（1小節目 4分×4、2小節目 全音符）、2小節の譜になる", async () => {
  await page.getByLabel("録音する長さ").selectOption("2");
  await recordButton().click();
  const q = 60 / TEMPO;
  await tapAlong([0, q, 2 * q, 3 * q, 4 * q]);
  await recordButton().waitFor({ timeout: 9000 });
  assert.equal(await page.locator(".section-rhythm-editor .step").count(), 16);
  assert.deepEqual(await stepCells(16), [
    ...["♪↓", "～", "♪↓", "～", "♪↓", "～", "♪↓", "～"],
    ...["♪↓", "～", "～", "～", "～", "～", "～", "～"],
  ]);
  assert.equal(await rhythmOf("サビ").locator(".rhythm-staff .tl-measure").count(), 2);
});

await check("リズム譜を採譜: マス目が16分でも 8分を叩けば ↓↑（8ビートとして判断）", async () => {
  await page.getByLabel("録音する長さ").selectOption("1");
  await page.locator(".section-rhythm-editor").getByRole("radio", { name: "16分" }).click();
  await recordButton().click();
  const e = 60 / TEMPO / 2;
  await tapAlong(Array.from({ length: 8 }, (_, i) => i * e));
  await recordButton().waitFor({ timeout: 6000 });
  assert.equal(await page.locator(".section-rhythm-editor .step").count(), 8);
  assert.deepEqual(await stepCells(8), EIGHTHS_UPDOWN);
});

await check("リズム譜を採譜: 音が 200ms 遅れる環境でも「補正を測る」で 8分の ↓↑ が正しく入る", async () => {
  try {
    const e = 60 / TEMPO / 2;
    const LAT = 0.2;
    const eighths = Array.from({ length: 8 }, (_, i) => i * e + LAT);
    await recordButton().click();
    await tapAlong(eighths);
    await recordButton().waitFor({ timeout: 6000 });
    assert.notDeepEqual(await stepCells(8), EIGHTHS_UPDOWN);
    await page.getByRole("button", { name: "補正を測る" }).click();
    await tapAlong(
      Array.from({ length: 8 }, (_, i) => i * 2 * e + LAT),
      undefined,
      "補正を測定中",
    );
    await page.getByText(/補正を \d+ms にしました/).waitFor({ timeout: 8000 });
    const ms = Number((await page.locator(".tap-offset strong").textContent()).replace(/[^\d-]/g, ""));
    assert.ok(Math.abs(ms - 200) <= 25, `測った補正 ${ms}ms`);
    await recordButton().click();
    await tapAlong(eighths);
    await recordButton().waitFor({ timeout: 6000 });
    assert.deepEqual(await stepCells(8), EIGHTHS_UPDOWN);
    await page.getByRole("button", { name: "0に戻す" }).click();
  } finally {
    await page.evaluate(() => localStorage.removeItem("guitar-player/tap-offset-ms"));
  }
});

await check("リズム譜を採譜: 細かさ「自動」で16分を叩くと16分で採譜し、マス目も16分になる", async () => {
  await page.locator(".section-rhythm-editor").getByRole("radio", { name: "8分" }).click();
  await recordButton().click();
  const s16 = 60 / TEMPO / 4;
  await tapAlong(Array.from({ length: 16 }, (_, i) => i * s16));
  await recordButton().waitFor({ timeout: 6000 });
  assert.equal(await page.locator(".section-rhythm-editor .step").count(), 16);
  assert.deepEqual(
    await stepCells(16),
    Array.from({ length: 16 }, (_, i) => (i % 2 ? "♪↑" : "♪↓")),
  );
});

await check("リズム譜: マス目で直す・消す（消すとセクションのリズム譜がなくなる、元に戻せる）", async () => {
  // 2マス目（1拍目の裏）を休符に
  await page.locator(".section-rhythm-editor .step").nth(1).click();
  await page.locator(".section-rhythm-editor").getByRole("button", { name: "休符", exact: true }).click();
  assert.equal((await stepCells(2))[1], "休");
  await page.locator(".section-rhythm-editor").getByRole("button", { name: "リズム譜を消す" }).click();
  assert.equal(await page.locator(".section-rhythm .rhythm-staff").count(), 0);
  await undoAll();
  await endEdit();
  assert.equal(await rhythmOf("サビ").locator(".rhythm-staff").count(), 1);
});

await check("数値の入力: テンポ・拍子を1文字ずつ打って入力できる（曲情報）", async () => {
  await startEdit();
  await page.getByRole("button", { name: "曲情報" }).click();
  const tempo = page.getByLabel("テンポ（BPM）");
  await typeLikeHuman(tempo, "120");
  assert.equal(await tempo.inputValue(), "120");
  assert.match(await page.locator(".song-meta").textContent(), /♩ = 120/);
  await typeLikeHuman(tempo, "999");
  assert.equal(await tempo.inputValue(), "400");
  await typeLikeHuman(tempo, "abc");
  assert.equal(await tempo.inputValue(), "400");
  await undoAll();
  assert.equal(await tempo.inputValue(), "120");
  const num = page.getByLabel("拍子の分子");
  await typeLikeHuman(num, "3");
  assert.match(await page.locator(".song-meta").textContent(), /3\/4拍子/);
  await typeLikeHuman(num, "4");
  await endEdit();
});

await check("スマートフォン幅でも横スクロールなしで読める", async () => {
  await page.getByRole("button", { name: "曲一覧へ戻る" }).click();
  await page.locator(".song-open", { hasText: "サンプル" }).click();
  await page.setViewportSize({ width: 375, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });
});

await check("バージョン番号を表示", async () => {
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile("package.json", "utf8"));
  assert.match(
    await page.locator(".app-footer").textContent(),
    new RegExp(`v${pkg.version.replace(/\./g, "\\.")} \\(`),
  );
});

// 条件が成り立つまで待つ
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error("待ち時間切れ");
    await new Promise((r) => setTimeout(r, 100));
  }
}

await check("端末間の同期: 2台で曲の追加・削除が伝わる（GitHub API は模擬）", async () => {
  // GitHub の Gist API の模擬（Node 側のメモリに保存）
  const gists = new Map();
  const json = (route, status, body) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      },
      body: JSON.stringify(body),
    });
  const fake = async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return json(route, 204, {});
    if ((await req.headerValue("authorization")) !== "Bearer ghp_test") return json(route, 401, {});
    const path = new globalThis.URL(req.url()).pathname;
    if (path === "/user") return json(route, 200, { login: "tester" });
    if (path === "/gists" && req.method() === "GET")
      return json(
        route,
        200,
        [...gists].map(([id, files]) => ({ id, files })),
      );
    if (path === "/gists" && req.method() === "POST") {
      const id = `g${gists.size + 1}`;
      gists.set(id, JSON.parse(req.postData()).files);
      return json(route, 201, { id, files: gists.get(id) });
    }
    const id = path.split("/")[2];
    if (!gists.has(id)) return json(route, 404, {});
    if (req.method() === "PATCH") gists.set(id, { ...gists.get(id), ...JSON.parse(req.postData()).files });
    return json(route, 200, { id, files: gists.get(id) });
  };
  const remoteTitles = () => {
    const files = [...gists.values()][0];
    return files
      ? JSON.parse(files["guitar-player-sync.json"].content)
          .songs.map((x) => x.title)
          .sort()
      : [];
  };
  // 開いたときは最後の曲の画面か曲一覧。曲一覧にそろえる
  const toList = async (p) => {
    await p.locator(".song-list-screen, .song-title-block").first().waitFor();
    if (await p.getByRole("button", { name: "曲一覧へ戻る" }).count())
      await p.getByRole("button", { name: "曲一覧へ戻る" }).click();
  };
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    await ctx.route("https://api.github.com/**", fake);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => pageErrors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.goto(URL);
    await toList(p);
    return { ctx, p };
  };
  const titles = (p) =>
    p
      .locator(".song-item-title")
      .allTextContents()
      .then((t) => t.sort());
  const connect = async (p, token) => {
    await p.getByRole("button", { name: /同期/ }).first().click();
    await p.getByLabel("GitHub のトークン").fill(token);
    await p.getByRole("button", { name: "接続して同期" }).click();
  };

  const A = await device();
  await connect(A.p, "ghp_wrong");
  await A.p.getByRole("alert").filter({ hasText: "トークンが無効" }).waitFor();
  await A.p.getByLabel("GitHub のトークン").fill("ghp_test");
  await A.p.getByRole("button", { name: "接続して同期" }).click();
  await A.p.getByRole("status").filter({ hasText: "同期済み" }).waitFor();
  assert.deepEqual(remoteTitles(), ["サンプル：あさのうた"]);
  // 曲を増やすと数秒後に自動で送られる
  await A.p.getByRole("button", { name: "複製" }).click();
  await until(() => remoteTitles().length === 2);

  // 2台目：つなぐと取り込まれる（未編集のサンプル曲は持ち込まない）
  const B = await device();
  await connect(B.p, "ghp_test");
  await until(
    async () => (await titles(B.p)).length === 2 && (await titles(B.p)).includes("サンプル：あさのうた（コピー）"),
  );
  assert.deepEqual(await titles(B.p), ["サンプル：あさのうた", "サンプル：あさのうた（コピー）"]);
  // 2台目で削除 → 1台目に伝わる
  await B.p.locator(".song-item", { hasText: "（コピー）" }).getByRole("button", { name: "削除" }).click();
  await until(() => remoteTitles().length === 1);
  await A.p.getByRole("button", { name: "今すぐ同期" }).click();
  await until(async () => (await titles(A.p)).length === 1);
  assert.deepEqual(await titles(A.p), ["サンプル：あさのうた"]);
  // 再読み込み後も接続が残り、削除した曲が戻ってこない
  await A.p.reload();
  await A.p
    .getByText(/同期済み/)
    .first()
    .waitFor();
  await toList(A.p);
  assert.deepEqual(await titles(A.p), ["サンプル：あさのうた"]);
  await A.ctx.close();
  await B.ctx.close();
});

await check("ページエラーなし", async () => {
  assert.deepEqual(pageErrors, []);
});

await browser.close();
server.kill();
for (const r of results) console.log(r.join(" "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
