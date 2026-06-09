// Screenshot driver for the Greenhouse-styled CellRunner states against the REAL built
// static host (python -m http.server 8765 at the repo root). Evidence for stream I′:
// warming / watch / misconception+ladder / syntax error / pass + cell complete.
import { chromium } from "playwright";

const APP_URL = "http://localhost:8765/packages/client/index.html";
const shot = (page, name) => page.screenshot({ path: new URL(`./evidence/greenhouse-${name}.png`, import.meta.url).pathname, fullPage: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// 1. warming state (race: grab it as soon as it appears)
await page.goto(APP_URL);
try {
  await page.locator(".app-state.app-warming").waitFor({ timeout: 30000 });
  await shot(page, "1-warming");
  console.log("warming captured");
} catch {
  console.log("warming state too fast to capture on this run");
}

// 2. watch step, styled (tiny markdown: bold/code/terrarium block)
const watch = page.locator('section[aria-label="watch step"]');
await watch.waitFor({ timeout: 90000 });
await shot(page, "2-watch");

// advance: predict (answer correctly), recognize (correctly) → build
await watch.getByRole("button", { name: "Continue" }).click();
const predict = page.locator('section[aria-label="predict step"]');
await predict.waitFor({ timeout: 10000 });
await shot(page, "3-predict");
await predict.locator('input[type="radio"][value="b"]').check();
await predict.getByRole("button", { name: "Submit" }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 30000 });
await shot(page, "4-predict-pass");
await page.getByRole("button", { name: "Continue" }).click();

const recognize = page.locator('section[aria-label="recognize step"]');
await recognize.waitFor({ timeout: 10000 });
await recognize.locator('input[type="radio"][value="b"]').check();
await recognize.getByRole("button", { name: "Submit" }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Continue" }).click();

// 3. build step: misconception (str+num) → amber band + title chip + hints
const build = page.locator('section[aria-label="build step"]');
await build.waitFor({ timeout: 10000 });
await shot(page, "5-build-editor");
const editor = page.locator(".cm-content");
await editor.click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type('def announce(number): return "Your random number is: " + number');
await build.getByRole("button", { name: /run.*check/i }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 120000 });
await shot(page, "6-misconception");
const hints = page.locator('aside[aria-label="hints"]');
await hints.getByRole("button", { name: "Show a hint" }).click();
await page.waitForTimeout(400);
await hints.getByRole("button", { name: "Show a hint" }).click();
await page.waitForTimeout(400);
await shot(page, "7-misconception-hints");
await hints.getByRole("button", { name: "Show a hint" }).click(); // level 3 — level 4 sits behind the confirm
await page.waitForTimeout(400);
await hints.getByRole("button", { name: "Show full solution" }).click();
await page.waitForTimeout(200);
await shot(page, "8-level4-confirm");
await hints.getByRole("button", { name: "Cancel" }).click();

// 4. error state: submit code with a syntax error → crimson band + error chip
await page.getByRole("button", { name: "Try again" }).click();
await editor.click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("def announce(number): return f'oops {number\"");
await build.getByRole("button", { name: /run.*check/i }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 60000 });
await shot(page, "9-error");

// 5. pass + cell complete
await page.getByRole("button", { name: "Try again" }).click();
await editor.click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type('def announce(number): return f"Your random number is: {number}"');
await build.getByRole("button", { name: /run.*check/i }).click();
await page.locator('[aria-label="feedback"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(800); // let fbIn + the pass-icon fbPop settle
await shot(page, "10-pass");
await page.getByRole("button", { name: "Continue" }).click();
await page.locator(".cell-complete").waitFor({ timeout: 10000 });
await page.waitForTimeout(800); // let the fbIn/fbPopSoft entrance animation settle
await shot(page, "11-cell-complete");

console.log("screenshots written to verification/evidence/greenhouse-*.png");
await browser.close();
