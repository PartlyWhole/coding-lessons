// Debt 5 — FULL learner walkthrough in a real browser: keyed step replacement, real
// in-browser Pyodide grading, attribution-colored feedback, pullable hint ladder
// (1 level/press, level 4 behind confirm), REAL-reload IndexedDB survival, static
// contentVersion-cached bundle fetch, EventBus emits with no subscriber.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const results = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.error(`${pass === false ? "✗" : "•"} ${name}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
let bundleFetches = 0;
const cdnRequests = new Set();
page.on("request", (r) => {
  if (r.url().endsWith("/bundle.json")) bundleFetches++;
  if (r.url().includes("cdn.jsdelivr.net")) cdnRequests.add(r.url().split("/").pop());
});

const readIdb = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("trellis");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["learner_skill", "diagnosis", "meta"], "readonly");
          const out = {};
          const grab = (store, key) => {
            const r = tx.objectStore(store).getAll();
            r.onsuccess = () => (out[key] = r.result);
          };
          grab("learner_skill", "skills");
          grab("diagnosis", "diagnoses");
          grab("meta", "meta");
          tx.oncomplete = () => { db.close(); resolve(out); };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

await page.goto("http://localhost:8765/verification/app/index.html");

// ── 1. watch step renders (app booted from the static host) ─────────────
const watch = page.locator('section[aria-label="watch step"]');
await watch.waitFor({ timeout: 60000 });
record("1-app-boots-watch-step", true, { firstStep: "watch" });

// keyed replacement: mark the live section node; after advance the node must be a NEW one
await watch.evaluate((el) => { el.__marker = "step1-node"; });
await watch.getByRole("button", { name: "Continue" }).click();

// ── 2. predict step replaced the watch step (keyed remount §5.2) ────────
const predict = page.locator('section[aria-label="predict step"]');
await predict.waitFor({ timeout: 10000 });
const markerGone = await predict.evaluate((el) => el.__marker === undefined);
const watchGone = (await page.locator('section[aria-label="watch step"]').count()) === 0;
record("2-keyed-step-replacement", markerGone && watchGone, { newNodeHasNoMarker: markerGone, oldStepUnmounted: watchGone });

// answer predict correctly (choice b: TypeError) and continue
await predict.locator('input[type="radio"][value="b"]').check();
await predict.getByRole("button", { name: "Submit" }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 10000 });
const predictFeedbackColor = await page.locator('[aria-label="feedback"]').evaluate((el) => getComputedStyle(el).color);
await page.getByRole("button", { name: "Continue" }).click();

// ── 3. recognize step: correct choice → pass feedback → continue ────────
const recognize = page.locator('section[aria-label="recognize step"]');
await recognize.waitFor({ timeout: 10000 });
await recognize.locator('input[type="radio"][value="b"]').check();
await recognize.getByRole("button", { name: "Submit" }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Continue" }).click();

// ── 4. build step: submit the str_num misconception → REAL Pyodide grades it
const build = page.locator('section[aria-label="build step"]');
await build.waitFor({ timeout: 10000 });
const editor = page.locator(".cm-content");
await editor.click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type('def announce(number): return "Your random number is: " + number');
await build.getByRole("button", { name: /run.*check/i }).click();
const feedback = page.locator('[aria-label="feedback"]');
await feedback.waitFor({ timeout: 120000 }); // first grade may cold-load Pyodide from the CDN
const fbText = await feedback.innerText();
const fbColor = await feedback.evaluate((el) => getComputedStyle(el).color);
record(
  "4-real-pyodide-grades-misconception",
  /str\(|f-string/i.test(fbText), // the authored mis.concat.str_num feedback text rendered
  { feedbackText: fbText.slice(0, 400), feedbackColor: fbColor, passFeedbackColorOnPredict: predictFeedbackColor, pyodideCdnAssetsFetched: [...cdnRequests].slice(0, 6) },
);

// ── 5. hint ladder: one level per press; level 4 behind a confirm ────────
const hints = page.locator('aside[aria-label="hints"]');
const hintCount = () => hints.locator("li.hint").count();
const counts = [await hintCount()];
for (let i = 0; i < 3; i++) {
  await hints.getByRole("button", { name: "Show a hint" }).click();
  await page.waitForTimeout(100);
  counts.push(await hintCount());
}
const confirmGateBefore = await hints.getByRole("button", { name: "Show full solution" }).count();
await hints.getByRole("button", { name: "Show full solution" }).click();
const confirmVisible = await hints.getByRole("button", { name: "Confirm" }).count();
await hints.getByRole("button", { name: "Confirm" }).click();
await page.waitForTimeout(100);
counts.push(await hintCount());
const solutionShown = await hints.locator("pre.hint-solution").count();
record(
  "5-hint-ladder-pull-one-per-press-level4-confirmed",
  JSON.stringify(counts) === "[0,1,2,3,4]" && confirmGateBefore === 1 && confirmVisible === 1 && solutionShown === 1,
  { hintCountsAfterEachPull: counts, level4WasBehindConfirm: confirmVisible === 1, revealCodeShown: solutionShown === 1 },
);

// ── 6. retry with a correct f-string → pass; cell completes ──────────────
await page.getByRole("button", { name: "Try again" }).click();
await editor.click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type('def announce(number): return f"Your random number is: {number}"');
await build.getByRole("button", { name: /run.*check/i }).click();
await feedback.waitFor({ timeout: 60000 });
const fbText2 = await feedback.innerText();
const fbColor2 = await feedback.evaluate((el) => getComputedStyle(el).color);
await page.getByRole("button", { name: "Continue" }).click();
const complete = await page.locator(".cell-complete").count();
record(
  "6-correct-solution-passes-cell-completes",
  fbColor2 !== fbColor && complete === 1,
  { passFeedback: fbText2.slice(0, 200), passColor: fbColor2, misconceptionColor: fbColor, attributionColorsDiffer: fbColor2 !== fbColor, cellComplete: complete === 1 },
);

// ── 7. REAL page reload: mastery + diagnosis history survive identically ─
const before = await readIdb();
const fetchesBeforeReload = bundleFetches;
await page.reload();
await page.locator('section[aria-label="watch step"]').waitFor({ timeout: 60000 });
const after = await readIdb();
record(
  "7-real-reload-idb-round-trip-identical",
  JSON.stringify(before.skills) === JSON.stringify(after.skills) &&
    JSON.stringify(before.diagnoses) === JSON.stringify(after.diagnoses) &&
    JSON.stringify(before.meta) === JSON.stringify(after.meta) &&
    before.diagnoses.length >= 3 && before.skills.length >= 1,
  {
    identical: JSON.stringify(before) === JSON.stringify(after),
    diagnosisCount: before.diagnoses.length,
    skills: before.skills.map((s) => ({ skillId: s.skillId, mastery: s.mastery, attempts: s.attempts })),
    learnerIdStable: JSON.stringify(before.meta) === JSON.stringify(after.meta),
  },
);

// ── 8. content static-fetch cached by contentVersion across the reload ───
record(
  "8-contentVersion-cache-no-refetch-on-reload",
  fetchesBeforeReload === 1 && bundleFetches === 1,
  { bundleFetchesFirstLoad: fetchesBeforeReload, bundleFetchesAfterReload: bundleFetches },
);

// ── 9. EventBus emit sites fired throughout with NO subscriber attached ──
record("9-eventbus-no-subscriber-no-errors", pageErrors.length === 0, { pageErrors });

const out = { results, pageErrors };
writeFileSync(new URL("./evidence/debt5.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
