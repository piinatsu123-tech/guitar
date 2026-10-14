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

async function selectChordFirst() {
  await page.locator(".progression .prog-chord").first().click();
}
const tabNumbers = () => page.locator(".play-detail .tab-view .tab-num").allTextContents();
const pianoLabel = () => page.locator(".play-detail .piano-view").getAttribute("aria-label");
const selectChord = (section, name, nth = 0) =>
  page
    .locator(`.progression section[aria-label="${section}"] .prog-chord:not(.continued)`, {
      hasText: new RegExp(`^(▶ )?${name}`),
    })
    .nth(nth)
    .click();

await check("譜面表示が既定: TAB・歌詞・音符が表示、ピアノ・ピッキングは既定でオフ", async () => {
  assert.ok((await page.locator(".score .tl-diagram-box .tab-view").count()) > 10);
  assert.ok((await page.locator(".score .tl-lyrics").count()) > 10);
  assert.ok((await page.locator(".score .tl-notes").count()) > 10);
  assert.equal(await page.locator(".score .tl-pianos").count(), 0);
  assert.equal(await page.locator(".score .tl-strokes").count(), 0);
});

await check("譜面表示: 各段のオン・オフと上から TAB→ピアノ→歌詞→音符→ピッキング の順", async () => {
  await page.locator(".settings-panel label", { hasText: "ピアノ鍵盤" }).click();
  await page.locator(".settings-panel label", { hasText: "ピッキング" }).click();
  const tops = await page.evaluate(() => {
    const m = document.querySelector(".score .tl-measure");
    return [".tl-diagrams", ".tl-pianos", ".tl-lyrics", ".tl-notes", ".tl-strokes"].map(
      (sel) => m.querySelector(sel).getBoundingClientRect().top,
    );
  });
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] > tops[i - 1], JSON.stringify(tops));
  await page.locator(".settings-panel label", { hasText: "TAB" }).click();
  assert.equal(await page.locator(".score .tl-diagram-box").count(), 0);
  assert.ok((await page.locator(".score .tl-diagram-name").count()) > 10); // コード名は残る
  await page.locator(".settings-panel label", { hasText: "TAB" }).click();
  await page.locator(".settings-panel label", { hasText: "ピアノ鍵盤" }).click();
  await page.locator(".settings-panel label", { hasText: "ピッキング" }).click();
});

await check("譜面表示: コード図とコード名の対応（2小節目 G = 320003）、タップで選択", async () => {
  const g = page.locator(".score .tl-measure").nth(1);
  assert.equal((await g.locator(".tl-diagram-name").first().textContent()).trim(), "G");
  assert.deepEqual(
    (await g.locator(".tl-diagram-box .tab-view").getAttribute("aria-label")).match(/\d弦(開放|\d+フレット|ミュート)/g),
    ["1弦3フレット", "2弦開放", "3弦開放", "4弦開放", "5弦2フレット", "6弦3フレット"],
  );
  await g.locator(".tl-slot").first().click();
  assert.equal(await g.locator(".tl-slot").first().getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: /次 ▶/ }).click();
  assert.equal(
    await page.locator(".score .tl-measure").nth(2).locator(".tl-slot").first().getAttribute("aria-pressed"),
    "true",
  );
});

await check("コード詳細表示へ切替（ピアノ・ピッキングをオン）", async () => {
  await page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio", { name: "コード詳細" }).click();
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.locator(".settings-panel label", { hasText: "ピアノ鍵盤" }).click();
  await page.locator(".settings-panel label", { hasText: "ピッキング" }).click();
  await selectChordFirst();
  assert.equal(await page.locator(".play-detail .piano-view").count(), 1);
});

await check("初期表示: C (x32010) の TAB 数字（1弦→6弦）", async () => {
  assert.deepEqual(await tabNumbers(), ["0", "1", "0", "2", "3", "×"]);
});

await check("TAB と鍵盤の音高が一致（C: C3 E3 G3 C4 E4、ミュート弦は鍵盤に出ない）", async () => {
  const label = await pianoLabel();
  assert.equal(label, "ピアノ鍵盤: 5弦 C3、4弦 E3、3弦 G3、2弦 C4、1弦 E4");
  assert.equal(await page.locator(".play-detail .piano-view .key-marker").count(), 5);
});

await check("同じ音名でもオクターブ違いは別の鍵盤（C3 と C4）", async () => {
  const on = await page.locator(".play-detail .piano-view rect.on").count();
  assert.equal(on, 5);
});

await check("コード選択で TAB・鍵盤・リズムが同時に更新（G）", async () => {
  await selectChord("Aメロ", "G");
  assert.equal(await page.locator(".current-chord-name").textContent(), "G");
  const nums = await tabNumbers();
  assert.deepEqual(nums.slice(1), ["0", "0", "0", "2", "3"]);
  assert.match(await pianoLabel(), /6弦 G2、5弦 B2、4弦 D3、3弦 G3/);
  assert.ok((await page.locator(".tl-chord.selected").textContent()).includes("G"));
});

await check("ミュート弦（Dm xx0231）は TAB で × 、鍵盤に含まれない", async () => {
  await selectChord("Aメロ", "Dm");
  assert.deepEqual(await tabNumbers(), ["1", "3", "2", "0", "×", "×"]);
  const label = await pianoLabel();
  assert.ok(!label.includes("6弦") && !label.includes("5弦"), label);
});

await check("開放弦は0フレットとして音名付きで表示（Dm の4弦開放 = レ）", async () => {
  const openLabels = await page.locator(".play-detail .tab-view .dot-label.open").allTextContents();
  assert.deepEqual(openLabels, ["レ"]);
});

await check("前／次のコードへ移動", async () => {
  await page.getByRole("button", { name: /次 ▶/ }).click();
  assert.equal(await page.locator(".current-chord-name").textContent(), "G7");
  await page.getByRole("button", { name: /◀ 前/ }).click();
  assert.equal(await page.locator(".current-chord-name").textContent(), "Dm");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator(".current-chord-name").textContent(), "G7");
});

await check("保存フォーム（F 133211）が使われる", async () => {
  await selectChord("Aメロ", "F");
  assert.deepEqual(await tabNumbers(), ["1", "1", "2", "3", "3", "1"]);
  assert.equal(await page.locator(".current-chord .badge.saved").count(), 1);
});

await check("表示設定: TAB と鍵盤を個別に非表示", async () => {
  await page.locator(".settings-panel label", { hasText: "ピアノ鍵盤" }).click();
  assert.equal(await page.locator(".play-detail .piano-view").count(), 0);
  assert.equal(await page.locator(".play-detail .tab-view").count(), 1);
  await page.locator(".settings-panel label", { hasText: "TAB" }).click();
  assert.equal(await page.locator(".play-detail .tab-view").count(), 0);
  await page.locator(".settings-panel label", { hasText: "TAB" }).click();
  await page.locator(".settings-panel label", { hasText: "ピアノ鍵盤" }).click();
  assert.equal(await page.locator(".play-detail .piano-view").count(), 1);
});

await check("表示設定: TAB=ABC、鍵盤=非表示（ラベルだけ消え位置は維持）", async () => {
  await selectChord("Aメロ", "C");
  await page.getByRole("radiogroup", { name: "TAB譜の音名" }).getByRole("radio", { name: "ABC" }).click();
  await page.getByRole("radiogroup", { name: "ピアノ鍵盤の音名" }).getByRole("radio", { name: "非表示" }).click();
  const labels = (await page.locator(".play-detail .tab-view .dot-label").allTextContents()).filter(Boolean);
  assert.deepEqual(labels.sort(), ["C", "C", "E", "E", "G"]);
  assert.equal(await page.locator(".play-detail .piano-view .key-label").count(), 0);
  assert.equal(await page.locator(".play-detail .piano-view .key-marker").count(), 5);
  await page.getByRole("radiogroup", { name: "TAB譜の音名" }).getByRole("radio", { name: "非表示" }).click();
  assert.equal((await page.locator(".play-detail .tab-view .dot-label").allTextContents()).filter(Boolean).length, 0);
  assert.equal(await page.locator(".play-detail .tab-view .fret-dot").count(), 3);
  await page.getByRole("radiogroup", { name: "TAB譜の音名" }).getByRole("radio", { name: "ドレミ" }).click();
});

await check("歌詞の文字タップでマーク、再タップで解除、複数選択可", async () => {
  const chars = page.locator(".tl-lyrics .lyric-char");
  const sa = chars.filter({ hasText: "さ" }).first();
  const no = chars.filter({ hasText: "の" }).first();
  await sa.click();
  await no.click();
  assert.equal(await sa.getAttribute("aria-pressed"), "true");
  assert.equal(await no.getAttribute("aria-pressed"), "true");
  await no.click();
  assert.equal(await no.getAttribute("aria-pressed"), "false");
  assert.ok((await page.locator(".prog-chord.selected .prog-lyric .accent").allTextContents()).includes("さ"));
});

await check("再読み込み後も設定・マークが維持される", async () => {
  await page.reload();
  await selectChord("Aメロ", "C");
  const sa = page.locator(".tl-lyrics .lyric-char").filter({ hasText: "さ" }).first();
  assert.equal(await sa.getAttribute("aria-pressed"), "true");
});

await check("フォーム: 候補を複数表示 → 選択して保存 → 演奏画面に反映 → 再読み込みで維持", async () => {
  await selectChord("Aメロ", "C");
  await page.getByRole("button", { name: "フォーム編集" }).click();
  const candidates = page.locator(".candidate");
  assert.ok((await candidates.count()) >= 3);
  await candidates.nth(1).click();
  const short = (await candidates.nth(1).locator(".mono").textContent()).trim();
  await page.getByRole("button", { name: "このフォームを使う" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
  await selectChord("Aメロ", "C");
  assert.equal(await page.locator(".current-chord .badge").first().textContent(), short);
  await page.reload();
  await selectChord("サビ", "C");
  assert.equal(await page.locator(".current-chord .badge").first().textContent(), short);
});

await check("フォーム: 手動入力（指板タップ）と構成音チェック", async () => {
  await selectChord("Aメロ", "G");
  await page.getByRole("button", { name: "フォーム編集" }).click();
  await page.getByLabel("1弦のフレット（x でミュート）").fill("x");
  await page.getByLabel("2弦のフレット（x でミュート）").fill("3");
  assert.match(await page.locator(".form-editor .analysis").first().textContent(), /✓ G/);
  await page.getByLabel("3弦 2フレット").click({ force: true });
  assert.match(await page.locator(".form-editor .analysis").first().textContent(), /⚠/);
  await page.getByLabel("3弦 2フレット").click({ force: true }); // 再タップでミュート
  assert.equal(await page.getByLabel("3弦のフレット（x でミュート）").inputValue(), "x");
  await page.getByRole("button", { name: "このフォームを使う" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
  await selectChord("Aメロ", "G");
  assert.deepEqual(await tabNumbers(), ["×", "3", "×", "0", "2", "3"]);
});

const editMode = (name) =>
  page
    .getByRole("radiogroup", { name: "編集モード" })
    .getByRole("radio", { name: name === "見る" ? "見る" : `✎ ${name}`, exact: true })
    .click();
const detailView = () =>
  page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio", { name: "コード詳細" }).click();
const scoreSlot = (barNo, i = 0) =>
  page
    .locator(".score .tl-measure")
    .nth(barNo - 1)
    .locator(".tl-slot")
    .nth(i);

await check("譜面でコード編集: コード名を変えると TAB が古いまま残らない", async () => {
  await editMode("コード");
  await scoreSlot(2).click(); // Aメロ 2小節目（保存フォームのある G）
  await page.getByLabel("コード名").fill("Em");
  await page.getByLabel("コード名").press("Enter");
  await editMode("見る");
  await detailView();
  await selectChord("Aメロ", "Em");
  assert.deepEqual(await tabNumbers(), ["0", "0", "0", "2", "2", "0"]);
});

await check("リズム: 音符とストロークを独立して設定（音符＋弾かない＝伸ばす）", async () => {
  await page.getByRole("button", { name: "フォーム・パターン" }).click();
  await page.getByRole("tab", { name: "リズム" }).click();
  await page.locator(".pattern-editor").waitFor();
  const steps = page.locator(".step");
  await steps.nth(2).click();
  await page.getByRole("button", { name: /弾かずに伸ばす/ }).click();
  await steps.nth(3).click();
  await page.getByRole("button", { name: "休符", exact: true }).click();
  assert.equal(await steps.nth(2).locator(".step-action").textContent(), "—");
  assert.equal(await steps.nth(3).locator(".step-state").textContent(), "休");
  const preview = page.locator(".pattern-editor .timeline");
  assert.ok((await preview.locator('[aria-label="弾かずに伸ばす"]').count()) >= 1);
  assert.ok((await preview.locator(".note-glyph.rest").count()) >= 1);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
});

await check("譜面で歌詞編集: テキスト編集とタイミング調整（音楽的位置で保存）", async () => {
  await editMode("歌詞");
  await scoreSlot(1).click();
  const input = page.getByLabel("C の歌詞");
  await input.fill("あさのひかりが!");
  await input.press("Enter");
  await page.locator(".lyric-chip", { hasText: "!" }).click();
  await page.locator(".timing-cell").nth(15).click();
  await page.getByText(/「!」: 1小節 4拍（a）/).waitFor();
  await editMode("見る");
  await detailView();
  await selectChord("Aメロ", "C");
  assert.ok((await page.locator(".play-detail .tl-lyrics").textContent()).includes("!"));
});

// レスポンシブ：画面幅が変わっても小節内の相対位置が同じ
async function relativePositions(width) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const m = document.querySelector(".play-detail .tl-measure").getBoundingClientRect();
    const rel = (sel) =>
      [...document.querySelectorAll(`.play-detail .tl-measure:first-of-type ${sel}`)].map(
        (e) => Math.round(((e.getBoundingClientRect().left - m.left) / m.width) * 1000) / 1000,
      );
    return { notes: rel(".tl-note"), strokes: rel(".tl-stroke"), lyrics: rel(".tl-lyric-group") };
  });
}
await check("画面幅を変えても音符・ストローク・歌詞の対応関係が崩れない", async () => {
  await selectChord("Aメロ", "C");
  const wide = await relativePositions(1280);
  const narrow = await relativePositions(390);
  for (const k of ["notes", "strokes", "lyrics"]) {
    assert.equal(wide[k].length, narrow[k].length, k);
    wide[k].forEach((v, i) => assert.ok(Math.abs(v - narrow[k][i]) < 0.02, `${k}[${i}] ${v} vs ${narrow[k][i]}`));
  }
  // 音符とストロークの開始位置が揃っている
  wide.strokes.forEach((s) =>
    assert.ok(
      wide.notes.some((n) => Math.abs(n - s) < 0.005),
      `stroke ${s}`,
    ),
  );
});

await check("スマートフォン幅でも主要操作が可能（コード選択・横スクロールなし）", async () => {
  await page.setViewportSize({ width: 375, height: 800 });
  await selectChord("サビ", "Am");
  assert.equal(await page.locator(".current-chord-name").textContent(), "Am");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  const small = await page.evaluate(
    () =>
      [...document.querySelectorAll(".prog-chord, .chord-nav button")].filter(
        (e) => e.getBoundingClientRect().height < 40,
      ).length,
  );
  assert.equal(small, 0);
});

await check("バージョン番号を表示", async () => {
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile("package.json", "utf8"));
  assert.match(
    await page.locator(".app-footer").textContent(),
    new RegExp(`v${pkg.version.replace(/\./g, "\\.")} \\(`),
  );
});

await check("再生: 選択中のコードから鳴らし、選択がテンポどおりに進む／停止で止まる", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await selectChord("Aメロ", "C");
  const name = () => page.locator(".current-chord-name").textContent();
  assert.equal(await name(), "C");
  await page.getByRole("button", { name: "▶ 再生" }).click();
  await page.getByRole("button", { name: "■ 停止" }).waitFor();
  // ♩=96、C は1小節 = 2.5秒。2.0秒ではまだ C、3.0秒では次のコード
  await page.waitForTimeout(2000);
  assert.equal(await name(), "C");
  await page.waitForTimeout(1000);
  assert.notEqual(await name(), "C");
  const at = await name();
  await page.getByRole("button", { name: "■ 停止" }).click();
  await page.getByRole("button", { name: "▶ 再生" }).waitFor();
  await page.waitForTimeout(3000);
  assert.equal(await name(), at, "停止後は進まない");
});

await check("リズム編集: ▶ 試聴 と停止", async () => {
  await page.getByRole("button", { name: "フォーム・パターン" }).click();
  await page.getByRole("tab", { name: "リズム" }).click();
  await page.getByRole("button", { name: /▶ 試聴/ }).click();
  await page.getByRole("button", { name: "■ 停止" }).waitFor();
  await page.getByRole("button", { name: "■ 停止" }).click();
  await page.getByRole("button", { name: /▶ 試聴/ }).waitFor();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
});

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

await check("タップ入力: クリックに合わせた4分のタップ → 4分ダウン×4", async () => {
  await page.getByRole("button", { name: "フォーム・パターン" }).click();
  await page.getByRole("tab", { name: "リズム" }).click();
  await page.locator(".pattern-editor .chip, .rhythm-editor .chip").filter({ hasText: "全音符" }).click();
  await page.getByRole("button", { name: "● 録音" }).click();
  const q = 60 / 96; // ♩=96
  await tapAlong([0, q, 2 * q, 3 * q]);
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 6000 });
  const steps = page.locator(".step");
  assert.equal(await steps.count(), 8);
  const states = await steps.locator(".step-state").allTextContents();
  const actions = await steps.locator(".step-action").allTextContents();
  assert.deepEqual(states, ["♪", "～", "♪", "～", "♪", "～", "♪", "～"]);
  assert.deepEqual(actions.filter(Boolean), ["↓", "↓", "↓", "↓"]);
  assert.match(await page.locator(".tap-status").textContent(), /4個の音符を8分の細かさで入力しました/);
});

await check("タップ入力: 裏拍は自動でアップ（↓ ↓↑ ・↑ ↓↑）、元に戻せる", async () => {
  const e = 60 / 96 / 2; // 8分
  await page.getByRole("button", { name: "● 録音" }).click();
  await tapAlong([0, 2 * e, 3 * e, 5 * e, 6 * e, 7 * e]);
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 6000 });
  const steps = page.locator(".step");
  const cells = [];
  for (let i = 0; i < 8; i++) {
    cells.push(
      (await steps.nth(i).locator(".step-state").textContent()) +
        (await steps.nth(i).locator(".step-action").textContent()),
    );
  }
  assert.deepEqual(cells, ["♪↓", "～", "♪↓", "♪↑", "～", "♪↑", "♪↓", "♪↑"]);
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.deepEqual((await steps.locator(".step-action").allTextContents()).filter(Boolean), ["↓", "↓", "↓", "↓"]);
});

await check("タップ入力: 2小節まとめて採譜（1小節目 4分×4、2小節目 全音符）", async () => {
  await page.getByLabel("録音する長さ").selectOption("2");
  await page.getByRole("button", { name: "● 録音" }).click();
  const q = 60 / 96;
  await tapAlong([0, q, 2 * q, 3 * q, 4 * q]);
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 9000 });
  const steps = page.locator(".step");
  assert.equal(await steps.count(), 16);
  const cells = [];
  for (let i = 0; i < 16; i++) {
    cells.push(
      (await steps.nth(i).locator(".step-state").textContent()) +
        (await steps.nth(i).locator(".step-action").textContent()),
    );
  }
  assert.deepEqual(cells, [
    "♪↓",
    "～",
    "♪↓",
    "～",
    "♪↓",
    "～",
    "♪↓",
    "～",
    "♪↓",
    "～",
    "～",
    "～",
    "～",
    "～",
    "～",
    "～",
  ]);
  // 1小節ごとに折り返して表示（2行目の先頭は1行目の先頭の真下）
  const [a, b] = [await steps.nth(0).boundingBox(), await steps.nth(8).boundingBox()];
  assert.ok(Math.abs(a.x - b.x) < 2 && b.y > a.y, JSON.stringify([a, b]));
  assert.equal(await page.locator(".pattern-editor .timeline .tl-measure").count(), 2);
  assert.equal(await page.locator(".pattern-editor .form-grid select").first().inputValue(), "96");
  await page.getByRole("button", { name: "破棄" }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
});

const stepCells = async (n) => {
  const steps = page.locator(".step");
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

await check("タップ入力: 16分グリッドでも 8分を叩けば ↓↑（8ビートとして判断）", async () => {
  await page.getByRole("button", { name: "フォーム・パターン" }).click();
  await page.getByRole("tab", { name: "リズム" }).click();
  await page.getByRole("radio", { name: "16分" }).click();
  await page.getByRole("button", { name: "● 録音" }).click();
  const e = 60 / 96 / 2;
  await tapAlong(Array.from({ length: 8 }, (_, i) => i * e));
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 6000 });
  // 8分で採譜されたので、マス目も8分に切り替わる
  assert.equal(await page.locator(".step").count(), 8);
  assert.deepEqual(await stepCells(8), EIGHTHS_UPDOWN);
});

await check("タップ入力: 音が 200ms 遅れる環境でも「補正を測る」で 8分の ↓↑ が正しく入る", async () => {
  try {
    await calibrationScenario();
  } finally {
    // 失敗しても補正を残さない（後のテストに影響させない）
    await page.evaluate(() => localStorage.removeItem("guitar-player/tap-offset-ms"));
  }
});

async function calibrationScenario() {
  await page.getByRole("radio", { name: "8分" }).click();
  const e = 60 / 96 / 2;
  const LAT = 0.2;
  const eighths = Array.from({ length: 8 }, (_, i) => i * e + LAT);
  // 補正なし：ずれて入る（シミュレーションで見つけた症状の再現）
  await page.getByRole("button", { name: "● 録音" }).click();
  await tapAlong(eighths);
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 6000 });
  assert.notDeepEqual(await stepCells(8), EIGHTHS_UPDOWN);
  // 補正を測る：4分のクリックに合わせて2小節（8回）、同じく 200ms 遅れ
  await page.getByRole("button", { name: "補正を測る" }).click();
  await tapAlong(
    Array.from({ length: 8 }, (_, i) => i * 2 * e + LAT),
    undefined,
    "補正を測定中",
  );
  await page.getByText(/補正を \d+ms にしました/).waitFor({ timeout: 8000 });
  const ms = Number((await page.locator(".tap-offset strong").textContent()).replace(/[^\d-]/g, ""));
  assert.ok(Math.abs(ms - 200) <= 25, `測った補正 ${ms}ms`);
  // 補正後：正しく入る
  await page.getByRole("button", { name: "● 録音" }).click();
  await tapAlong(eighths);
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 6000 });
  const status = await page.locator(".tap-status").textContent();
  assert.deepEqual(await stepCells(8), EIGHTHS_UPDOWN, `補正 ${ms}ms / ${status}`);
  await page.getByRole("button", { name: "0に戻す" }).click();
  await page.getByRole("button", { name: "破棄" }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
}

await check("タップ入力: 細かさ「自動」で16分を叩くと16分で採譜し、マス目も16分になる", async () => {
  await page.getByRole("button", { name: "フォーム・パターン" }).click();
  await page.getByRole("tab", { name: "リズム" }).click();
  await page.getByRole("radio", { name: "8分" }).click(); // マス目は8分のまま始める（今回の症状の条件）
  assert.equal(await page.locator(".step").count(), 8);
  await page.getByRole("button", { name: "● 録音" }).click();
  const s16 = 60 / 96 / 4;
  await tapAlong(Array.from({ length: 16 }, (_, i) => i * s16));
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 6000 });
  assert.equal(await page.locator(".step").count(), 16);
  assert.deepEqual(
    await stepCells(16),
    Array.from({ length: 16 }, (_, i) => (i % 2 ? "♪↑" : "♪↓")),
  );
  assert.match(await page.locator(".tap-status").textContent(), /16個の音符を16分の細かさで入力/);
  await page.getByRole("button", { name: "破棄" }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
});

const bar = (n) => page.locator(".score .tl-measure").nth(n - 1);
const selectBar = (n) => page.getByRole("button", { name: `${n}小節目を選択`, exact: true }).click();
const notesIn = (n) => bar(n).locator(".tl-note").count();

await check("譜面でリズム編集: 1小節をマス目で編集すると、その小節だけ「個別」になる", async () => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.reload();
  if ((await page.locator(".score").count()) === 0) {
    await page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio", { name: "譜面" }).click();
  }
  await editMode("リズム");
  const before2 = await notesIn(2);
  const before3 = await notesIn(3);
  await selectBar(2);
  await selectBar(3);
  await page.getByRole("tab", { name: "マス目で編集" }).click();
  // 2小節目の 1&（2マス目）を ↑ の音符にする
  await page.locator(".measure-panel .step").nth(1).click();
  await page.locator(".measure-panel").getByRole("button", { name: "♪ 音符" }).click();
  await page
    .locator(".measure-panel")
    .getByRole("button", { name: /アップストローク/ })
    .click();
  assert.equal(await bar(2).locator(".tl-custom").count(), 1);
  assert.equal(await notesIn(2), before2 + 1, "1& に音符が1つ増える");
  assert.equal(await bar(3).locator(".tl-custom").count(), 0, "変えていない小節はパターンのまま");
  assert.equal(await notesIn(3), before3);
});

await check("譜面でリズム編集: 2小節をまとめてタップ録音（曲のコードで鳴らしながら）", async () => {
  const before1 = await notesIn(1);
  await page.getByRole("tab", { name: "タップで録音" }).click();
  await page.getByRole("button", { name: "● 録音" }).click();
  const e = 60 / 96 / 2;
  // 2小節目：8分 ×8、3小節目：4分 ×4
  await tapAlong([...Array.from({ length: 8 }, (_, i) => i * e), ...[8, 10, 12, 14].map((i) => i * e)]);
  await page.getByRole("button", { name: "● 録音" }).waitFor({ timeout: 9000 });
  assert.equal(await notesIn(2), 8);
  assert.equal(await notesIn(3), 4);
  assert.equal(await bar(3).locator(".tl-custom").count(), 1);
  assert.equal(await notesIn(1), before1, "選んでいない小節は変わらない");
});

await check("譜面でリズム編集: コピー＆貼り付け、パターンに戻す、元に戻す", async () => {
  await page.getByRole("button", { name: "選択を解除" }).click();
  await selectBar(2);
  await page.getByRole("tab", { name: "パターン・コピー" }).click();
  await page.getByRole("button", { name: /この1小節をコピー/ }).click();
  await page.getByRole("button", { name: "選択を解除" }).click();
  const before5 = await notesIn(5);
  await selectBar(5);
  await page.getByRole("tab", { name: "パターン・コピー" }).click();
  await page.getByRole("button", { name: /^貼り付け/ }).click();
  assert.equal(await notesIn(5), 8);
  assert.equal(await notesIn(2), 8, "コピー元はそのまま");
  await page.getByRole("button", { name: "直接入力をやめてパターンに戻す" }).click();
  assert.equal(await notesIn(5), before5);
  assert.equal(await bar(5).locator(".tl-custom").count(), 0);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  assert.equal(await notesIn(5), 8);
});

await check("譜面でリズム編集: 選んだ小節だけを聴ける（▶ 聴く／■ 停止）", async () => {
  await page.locator(".measure-panel").getByRole("button", { name: "▶ 聴く" }).click();
  await page.locator(".measure-panel").getByRole("button", { name: "■ 停止" }).waitFor();
  await page.locator(".measure-panel").getByRole("button", { name: "■ 停止" }).click();
  await page.locator(".measure-panel").getByRole("button", { name: "▶ 聴く" }).waitFor();
});

await check("譜面でリズム編集: パターンとして保存できる", async () => {
  await page.evaluate(() => {
    window.prompt = () => "サビの刻み";
  });
  await page.getByRole("button", { name: "パターンとして保存" }).click();
  assert.ok((await page.getByLabel("当てはめるパターン").locator("option").allTextContents()).includes("サビの刻み"));
});

await check("譜面でリズム編集: 再読み込み後も残る", async () => {
  await page.reload();
  assert.equal(await notesIn(2), 8);
  assert.equal(await notesIn(5), 8);
  assert.equal(await bar(5).locator(".tl-custom").count(), 1);
});

await check("新しい曲: 譜面のコード編集と曲情報が開き、コード・セクションを作れる", async () => {
  await page.getByRole("button", { name: "曲一覧へ戻る" }).click();
  await page.getByRole("button", { name: "＋ 新しい曲" }).click();
  await page
    .getByRole("radiogroup", { name: "編集モード" })
    .getByRole("radio", { name: /コード/, checked: true })
    .waitFor();
  await page.locator(".card").getByLabel("曲名").fill("テストの曲");
  assert.equal(await page.locator(".song-title-block h1").textContent(), "テストの曲");
  // セクションをテキストでまとめて入力
  await scoreSlot(1).click();
  await page.getByRole("tab", { name: /セクション/ }).click();
  await page.locator(".edit-panel summary").click();
  await page.getByLabel("コード進行のテキスト").fill("| G | D | Em C | D |");
  await page.locator(".edit-panel").getByRole("button", { name: "適用" }).click();
  const names = await page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents();
  assert.deepEqual(names, ["G", "D", "Em", "C", "D"]);
  // コードを選んで半分に分け、後ろに追加
  await scoreSlot(1).click();
  await page.getByRole("tab", { name: /コード「/ }).click();
  await page.getByRole("button", { name: "半分に分ける" }).click();
  assert.deepEqual(await page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents(), [
    "G",
    "G",
    "D",
    "Em",
    "C",
    "D",
  ]);
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.deepEqual(await page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents(), [
    "G",
    "D",
    "Em",
    "C",
    "D",
  ]);
  await page.getByRole("button", { name: "やり直す" }).click();
  assert.equal(await page.locator(".score .tl-diagram:not(.continued)").count(), 6);
  // 再読み込みしても残る
  await page.reload();
  assert.equal(await page.locator(".song-title-block h1").textContent(), "テストの曲");
  assert.equal(await page.locator(".score .tl-diagram:not(.continued)").count(), 6);
});

await check("aug・dim に 7th・テンションが付いたコードを入力・表示できる", async () => {
  await editMode("コード");
  await scoreSlot(1).click();
  await page.getByRole("tab", { name: /コード「/ }).click();
  // 一覧のボタンで aug7、入力欄で Cdim9
  await page.getByRole("group", { name: "種類" }).getByRole("button", { name: "aug7", exact: true }).click();
  assert.match(await page.locator(".ce-preview .analysis").textContent(), /✓ Gaug7（オーギュメント・セブンス）/);
  await page.getByLabel("コード名").fill("Cdim9");
  await page.getByLabel("コード名").press("Enter");
  assert.match(await page.locator(".ce-preview .analysis").textContent(), /✓ Cdim9/);
  assert.equal(await page.locator(".ce-preview .tab-view").count(), 1);
  await page.getByLabel("コード名").fill("G7(♭9)");
  await page.getByLabel("コード名").press("Enter");
  assert.match(await page.locator(".ce-preview .analysis").textContent(), /✓ G7\(♭9\)（セブンス（♭9））/);
  // まとめて入力でも
  await page.getByRole("tab", { name: /セクション/ }).click();
  await page.locator(".edit-panel summary").click();
  await page.getByLabel("コード進行のテキスト").fill("| Caugmaj7 | Bm7b5 E7#9 | Am9 | D13 |");
  await page.locator(".edit-panel").getByRole("button", { name: "適用" }).click();
  assert.deepEqual(
    (await page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents()).slice(0, 5),
    ["Caugmaj7", "Bm7b5", "E7#9", "Am9", "D13"],
  );
  assert.equal(await page.locator(".score .tl-measure").first().locator(".tl-diagram-box .tab-view").count(), 1);
});

await check("歌詞から作る: 貼り付けた歌詞の文字にコードを置くと、そのまま曲になる", async () => {
  await page.getByRole("button", { name: "曲一覧へ戻る" }).click();
  await page.getByRole("button", { name: "＋ 歌詞から作る" }).click();
  await page.getByLabel("貼り付ける歌詞").fill("[Aメロ]\nあさのひかり まどをたたく\n\n[サビ]\nひかりのなかへ");
  await page.getByRole("button", { name: "シートにする" }).click();
  const cell = (sec, line, at) =>
    page.locator(".sheet-section").nth(sec).locator(".sheet-line").nth(line).locator(".sheet-cell").nth(at);
  assert.deepEqual(await page.locator(".sheet-section h2").allTextContents(), ["Aメロ", "サビ"]);
  await cell(0, 0, 0).click();
  await page.getByRole("group", { name: "ルート" }).getByRole("button", { name: "C", exact: true }).click();
  await cell(0, 0, 6).click(); // 「ま」
  await page.getByRole("group", { name: "ルート" }).getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("group", { name: "種類" }).getByRole("button", { name: "m7", exact: true }).click();
  await cell(0, 0, 13).click(); // 行末
  await page.getByLabel("コード名を入力").fill("G7");
  await page.getByLabel("コード名を入力").press("Enter");
  await cell(1, 0, 0).click();
  await page.locator(".sheet-panel").getByRole("button", { name: "C", exact: true }).first().click(); // この曲のコードから
  assert.deepEqual(await cell(0, 0, 6).locator(".sheet-chord").textContent(), "Am7");
  // 譜面に反映（1コード＝1小節）
  await editMode("見る");
  assert.deepEqual(await page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents(), [
    "C",
    "Am7",
    "G7",
    "C",
  ]);
  assert.ok(
    (await page.locator(".score .tl-measure").nth(1).locator(".tl-lyrics").textContent()).includes("まどをたたく"),
  );
  // 取り除くと、その歌詞は前のコードの続きに
  await editMode("歌詞シート");
  await cell(0, 0, 6).click();
  await page.locator(".sheet-panel").getByRole("button", { name: "取り除く" }).click();
  await editMode("見る");
  assert.deepEqual(await page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents(), [
    "C",
    "G7",
    "C",
  ]);
  // 再読み込み後もシートの行の形が残る
  await page.reload();
  await editMode("歌詞シート");
  assert.equal(await page.locator(".sheet-line").count(), 2);
  // 行末に歌詞のないコードを2つ重ねて置き、1つだけ取り除く（以前はその位置のコードがすべて消えた）
  const names = () => page.locator(".score .tl-diagram:not(.continued) .tl-diagram-name").allTextContents();
  await editMode("見る");
  const before = await names();
  await editMode("歌詞シート");
  await page.locator(".sheet-line").first().locator(".sheet-cell.end").click();
  const typed = page.locator(".sheet-panel").getByLabel("コード名を入力");
  const group = page.getByRole("radiogroup", { name: "この位置のコード" });
  const existing = (await group.getByRole("radio").allTextContents()).slice(0, -1); // 最後は「＋ もう1つ足す」
  if (existing.length) await page.locator(".sheet-panel").getByRole("radio", { name: "＋ もう1つ足す" }).click();
  await typed.fill("Am");
  await typed.press("Enter");
  await page.locator(".sheet-panel").getByRole("radio", { name: "＋ もう1つ足す" }).click();
  await typed.fill("D");
  await typed.press("Enter");
  assert.deepEqual((await group.getByRole("radio").allTextContents()).slice(0, -1), [...existing, "Am", "D"]);
  await group.getByRole("radio", { name: "Am", exact: true }).click();
  await page.locator(".sheet-panel").getByRole("button", { name: "「Am」を取り除く" }).click();
  assert.deepEqual((await group.getByRole("radio").allTextContents()).slice(0, -1), [...existing, "D"]);
  await editMode("見る");
  const after = await names();
  assert.equal(after.length, before.length + 1, `${before} → ${after}`);
  assert.ok(after.includes("D") && !after.includes("Am"));
});

await check("編集画面はコードフォームとリズムパターンだけ", async () => {
  await page.getByRole("button", { name: "フォーム・パターン" }).click();
  assert.deepEqual(await page.getByRole("tab").allTextContents(), ["コードフォーム", "リズムパターン"]);
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
});

// 人と同じように1文字ずつ打つ（fill は値を一度に入れるので、途中の値で起きる不具合を見逃す）
async function typeLikeHuman(locator, text) {
  await locator.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  for (const ch of text) await page.keyboard.type(ch, { delay: 20 });
  await page.keyboard.press("Enter");
}

await check("数値の入力: テンポ・拍子・コードの長さを1文字ずつ打って入力できる", async () => {
  await page.getByRole("button", { name: "曲情報" }).click();
  const tempo = page.locator(".card").getByLabel("テンポ（BPM）");
  await typeLikeHuman(tempo, "120");
  assert.equal(await tempo.inputValue(), "120");
  assert.match(await page.locator(".song-meta").textContent(), /♩ = 120/);
  // 範囲外は丸める、数字でなければ元に戻す
  await typeLikeHuman(tempo, "999");
  assert.equal(await tempo.inputValue(), "400");
  await typeLikeHuman(tempo, "abc");
  assert.equal(await tempo.inputValue(), "400");
  // 1回の入力は「元に戻す」1回で戻る
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  assert.equal(await tempo.inputValue(), "120");
  const num = page.getByLabel("拍子の分子");
  await typeLikeHuman(num, "3");
  assert.equal(await num.inputValue(), "3");
  assert.match(await page.locator(".song-meta").textContent(), /3\/4拍子/);
  await typeLikeHuman(num, "4");
  await page.getByRole("button", { name: "曲情報" }).click();
  await editMode("コード");
  await scoreSlot(1).click();
  const beats = page.getByLabel("長さ（拍）");
  await typeLikeHuman(beats, "1.5");
  assert.equal(await beats.inputValue(), "1.5");
  await editMode("見る");
});

await check("パワーコード（5）を一覧から選べて、鍵盤をタップしてフォームを編集できる", async () => {
  await editMode("コード");
  await scoreSlot(1).click();
  await page.getByRole("tab", { name: /コード「/ }).click();
  await page.getByRole("group", { name: "ルート" }).getByRole("button", { name: "E", exact: true }).click();
  await page.getByRole("group", { name: "種類" }).getByRole("button", { name: "5（パワー）" }).click();
  assert.match(await page.locator(".ce-preview .analysis").textContent(), /✓ E5（パワーコード）/);
  await page.locator(".ce-preview").getByRole("button", { name: "フォームを編集" }).click();
  const fret = (s) => page.getByLabel(`${s}弦のフレット（x でミュート）`).inputValue();
  const frets = async () => Promise.all([6, 5, 4, 3, 2, 1].map(fret));
  assert.deepEqual(await frets(), ["0", "2", "2", "x", "x", "x"]);
  // 鳴っていない E4 をタップ → 空いている1弦の開放で加わる
  await page.getByRole("button", { name: "鍵盤 E4" }).click();
  assert.deepEqual(await frets(), ["0", "2", "2", "x", "x", "0"]);
  assert.match(await page.locator(".form-editor .analysis").first().textContent(), /✓ E5/);
  // 鳴っている B2（5弦2F）をタップ → その弦がミュート
  assert.equal(await page.getByRole("button", { name: "鍵盤 B2" }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "鍵盤 B2" }).click();
  assert.deepEqual(await frets(), ["0", "x", "2", "x", "x", "0"]);
  // G♯3 を加えると3度が入るのでパワーコードではなくなる
  await page.getByRole("button", { name: "鍵盤 G♯3" }).click();
  assert.match(await page.locator(".form-editor .analysis").first().textContent(), /⚠/);
  // 鍵盤 D2 はギターで鳴らせないのでボタンにならない
  assert.equal(await page.getByRole("button", { name: "鍵盤 D2" }).count(), 0);
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
  await editMode("見る");
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
