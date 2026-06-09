// Stream L hotfix — browser-level regression for the live-site crash:
// a predict step receiving a second "submit" while in FEEDBACK (double-click / Enter spam /
// synthetic clicks on the disabled button) must NOT throw StepTransitionError, must NOT
// unmount the app, and must produce zero pageerrors and zero unhandled rejections.
// Run like run-debt5.mjs: build the client, serve the repo root on :8765, then `node` this.
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
// Collect unhandled promise rejections explicitly (the IDB-closing collateral surfaced here).
await page.addInitScript(() => {
  window.__unhandledRejections = [];
  window.addEventListener("unhandledrejection", (e) => {
    window.__unhandledRejections.push(String(e.reason));
  });
});

await page.goto("http://localhost:8765/packages/client/index.html");

// ── reach the predict step ───────────────────────────────────────────────
const watch = page.locator('section[aria-label="watch step"]');
await watch.waitFor({ timeout: 60000 });
await watch.getByRole("button", { name: "Continue" }).click();
const predict = page.locator('section[aria-label="predict step"]');
await predict.waitFor({ timeout: 10000 });

// ── 1. same-tick double submit (the race `grade` used to lose) ───────────
await predict.locator('input[type="radio"][value="b"]').check();
await predict.getByRole("button", { name: "Submit" }).evaluate((btn) => {
  // Two clicks in ONE tick — before any re-render can disable the button.
  btn.click();
  btn.click();
});
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 10000 });
const feedbackCount1 = await page.locator('[aria-label="feedback"]').count();
record("1-same-tick-double-submit-survives", pageErrors.length === 0 && feedbackCount1 === 1, {
  pageErrors: [...pageErrors],
  feedbackPanels: feedbackCount1,
});

// ── 2. submit-in-FEEDBACK spam (the production crash) ────────────────────
// The Submit button must now be disabled in FEEDBACK; spam it with synthetic clicks anyway
// (bypasses the disabled attribute) and Enter-spam the still-mounted step controls.
const submitDisabled = await predict.getByRole("button", { name: "Submit" }).isDisabled();
await predict.getByRole("button", { name: "Submit" }).evaluate((btn) => {
  for (let i = 0; i < 5; i++) btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await predict.locator('input[type="radio"][value="b"]').evaluate((el) => el.focus());
for (let i = 0; i < 10; i++) await page.keyboard.press("Enter");
await page.waitForTimeout(250);
const stillMounted = (await page.locator(".cell-runner").count()) === 1;
record(
  "2-feedback-submit-spam-no-crash",
  submitDisabled && stillMounted && pageErrors.length === 0,
  { submitDisabledInFeedback: submitDisabled, appStillMounted: stillMounted, pageErrors: [...pageErrors] },
);

// ── 3. double-click Continue (advance double-fire guard) ─────────────────
await page.getByRole("button", { name: "Continue" }).dblclick();
await page.waitForTimeout(250);
const recognize = page.locator('section[aria-label="recognize step"]');
const onRecognize = (await recognize.count()) === 1; // advanced exactly one step, not two
record("3-double-click-continue-advances-once", onRecognize && pageErrors.length === 0, {
  landedOnRecognize: onRecognize,
  pageErrors: [...pageErrors],
});

// ── 4. app still fully functional after the abuse ────────────────────────
await recognize.locator('input[type="radio"][value="b"]').check();
await recognize.getByRole("button", { name: "Submit" }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 10000 });
const rejections = await page.evaluate(() => window.__unhandledRejections);
record(
  "4-zero-pageerrors-zero-unhandled-rejections",
  pageErrors.length === 0 && rejections.length === 0,
  { pageErrors, unhandledRejections: rejections },
);

const out = { results, pageErrors };
writeFileSync(new URL("./evidence/l-crash-repro.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
