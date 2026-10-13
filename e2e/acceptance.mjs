// 受け入れテスト（仕様書 15章）を実ブラウザで確認する。
// 使い方: npm run build && npm run e2e
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe" });
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
    results.push(["✗", name, e.message.split("\n")[0]]);
  }
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();

const tabNumbers = () => page.locator(".play-detail .tab-view .tab-num").allTextContents();
const pianoLabel = () => page.locator(".play-detail .piano-view").getAttribute("aria-label");
const selectChord = (section, name, nth = 0) =>
  page
    .locator(`.progression section[aria-label="${section}"] .prog-chord:not(.continued)`, {
      hasText: new RegExp(`^(▶ )?${name}`),
    })
    .nth(nth)
    .click();

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
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.locator(".settings-panel label", { hasText: "ピアノ鍵盤" }).click();
  assert.equal(await page.locator(".play-detail .piano-view").count(), 0);
  assert.equal(await page.locator(".play-detail .tab-view").count(), 1);
  await page.locator(".settings-panel label", { hasText: "TAB譜" }).click();
  assert.equal(await page.locator(".play-detail .tab-view").count(), 0);
  await page.locator(".settings-panel label", { hasText: "TAB譜" }).click();
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

await check("コード名を変えると TAB が古いまま残らない", async () => {
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await page.getByRole("tab", { name: "コード進行" }).click();
  const input = page.locator('section[aria-label="セクション Aメロ"] .chord-name-input').nth(1);
  await input.fill("Em");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
  await selectChord("Aメロ", "Em");
  assert.deepEqual(await tabNumbers(), ["0", "0", "0", "2", "2", "0"]);
});

await check("リズム: 音符とストロークを独立して設定（音符＋弾かない＝伸ばす）", async () => {
  await page.getByRole("button", { name: "編集", exact: true }).click();
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
});

await check("歌詞: テキスト編集とタイミング調整（音楽的位置で保存）", async () => {
  await page.getByRole("tab", { name: "歌詞" }).click();
  const input = page.getByLabel("C の歌詞").first();
  await input.fill("あさのひかりが!");
  await input.press("Enter");
  await page.locator(".lyric-chip", { hasText: "!" }).click();
  await page.locator(".timing-cell").nth(15).click();
  assert.match(await page.locator(".lyrics-editor .btn-row .small").first().textContent(), /「!」: 1小節 4拍（a）/);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "‹ 演奏画面" }).click();
  await selectChord("Aメロ", "C");
  assert.ok((await page.locator(".tl-lyrics").textContent()).includes("!"));
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

await check("ページエラーなし", async () => {
  assert.deepEqual(pageErrors, []);
});

await browser.close();
server.kill();
for (const r of results) console.log(r.join(" "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
