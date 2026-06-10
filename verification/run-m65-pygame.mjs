// M6.5 DEFINING GATE (Task 14) — real-browser Playwright evidence for §17:
//   (a) static boot: canvas alive (pixel delta), keys reach the game ONLY when the
//       canvas is focused, editor stays focusable + typeable;
//   (b) Run→edit→Run restarts via gameGen — gen strictly increases, frame-tick rate
//       does not double (exactly one loop alive);
//   (c) submit grades HEADLESSLY in the worker — playback tick frozen while grading;
//       same (submission, seed, inputTape) twice → byte-identical canonicalDiagnosis;
//   (d) an await-less `while True:` is REFUSED before play (syntax-flavored message,
//       tick frozen — the source never reached runPythonAsync);
//   (e) a wrong `update` yields a misconception-attributed diagnosis (warm amber
//       feedback class, never error-red).
// Serves the repo root itself via python3 -m http.server on TRELLIS_PORT (default
// 8901 — NOT 8765). Network required: CDN Pyodide + the pygame-ce wheel.
// Usage: node verification/run-m65-pygame.mjs   (FOREGROUND; ~5-10 min)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CORRECT, WRONG, AWAITLESS } from "./m65-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PORT = process.env.TRELLIS_PORT ?? "8901";
const URL_ = `http://localhost:${PORT}/verification/m65-pygame.html`;

const results = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(evidence)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn("python3", ["-m", "http.server", PORT], { cwd: repoRoot, stdio: "ignore" });
await sleep(1200);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await ctx.newPage();
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));

const shot = (name) =>
  page.screenshot({ path: path.join(here, "evidence", `m65-${name}.png`), fullPage: true });
const tick = () => page.evaluate(() => window.__trellisFrameTick);
const keySeen = () => page.evaluate(() => window.__trellisKeySeen);
const gameGen = () => page.evaluate(() => window.gameGen);
const setEditor = (text) => page.evaluate((t) => window.__M65.setEditor(t), text);

// rate of the Python play loop in ticks/sec over a window
async function tickRate(windowMs = 1500) {
  const t0 = await tick();
  await sleep(windowMs);
  const t1 = await tick();
  return ((t1 - t0) * 1000) / windowMs;
}

try {
  await page.goto(URL_);

  // ---- (a) static boot ------------------------------------------------------
  const stage = page.locator('section[aria-label="pygame build step"]');
  await stage.waitFor({ timeout: 300_000 }); // app warmup gates on the WORKER pool
  const canvas = page.locator("canvas#canvas");
  await canvas.waitFor({ timeout: 10_000 });
  // game alive: the play loop is ticking and pixels change between samples
  await page.waitForFunction(() => window.__trellisFrameTick > 5, null, { timeout: 240_000 });
  // canvas alive: 3 samples — the ball must move in at least one interval (2 samples
  // can coincide on the bounce period)
  const snap = () => page.evaluate(() => document.querySelector("canvas#canvas").toDataURL());
  const s1 = await snap();
  await sleep(300);
  const s2 = await snap();
  await sleep(450);
  const s3 = await snap();
  record("a1-canvas-alive", s1.length > 1000 && (s1 !== s2 || s2 !== s3), {
    tick: await tick(),
    deltas: [s1 !== s2, s2 !== s3],
  });

  // editor focusable + typeable while the game runs (focus explicitly — SDL installs
  // its own pointer handlers around the canvas; read the doc back through the real
  // EditorView since CM virtualizes DOM text)
  await page.locator(".cm-content").click();
  await page.evaluate(() => document.querySelector(".cm-content").focus());
  await sleep(150);
  await page.keyboard.type("#zz");
  await sleep(150);
  const typed = await page.evaluate(() => window.__M65.getEditor());
  const focusedEditor = await page.evaluate(
    () => document.activeElement?.classList?.contains("cm-content") ?? false,
  );
  record("a3-editor-typeable", typed.includes("#zz"), { focusedEditor });

  // keyboard scoping: keys do NOT reach the game while the editor is focused…
  const k0 = await keySeen();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await sleep(600);
  const k1 = await keySeen();
  // …and DO reach it when the canvas is focused
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction((k) => window.__trellisKeySeen > k, k1, { timeout: 5_000 }).catch(() => {});
  const k2 = await keySeen();
  record("a2-keyboard-scoped-to-canvas", k1 === k0 && k2 > k1, { k0, k1, k2 });
  await shot("a-boot");

  // ---- (b) Run→edit→Run restarts via gameGen, no stacked loops ---------------
  const gen0 = await gameGen();
  const r0 = await tickRate();
  await setEditor(CORRECT + "\n# edited for restart\n");
  await page.getByRole("button", { name: /^run$/i }).click();
  await sleep(800);
  const gen1 = await gameGen();
  const r1 = await tickRate();
  record("b-gameGen-restart-no-stacked-loops", gen1 > gen0 && r1 > 10 && r1 < r0 * 1.6, {
    gen0,
    gen1,
    rateBefore: r0,
    rateAfter: r1,
  });
  await shot("b-restart");

  // ---- (d) await-less loop REFUSED before play -------------------------------
  await setEditor(AWAITLESS);
  await page.getByRole("button", { name: /^run$/i }).click();
  const refusal = page.locator(".feedback--syntax");
  await refusal.waitFor({ timeout: 30_000 });
  const refusalText = await refusal.textContent();
  const tFrozen0 = await tick();
  await sleep(900);
  const tFrozen1 = await tick();
  record(
    "d-awaitless-refused-pre-play",
    refusalText.includes("never yields") && tFrozen1 === tFrozen0,
    { refusalText, tickFrozen: tFrozen1 === tFrozen0 },
  );
  await shot("d-refusal");

  // ---- (e) wrong update → misconception (warm amber, via the UI ladder) ------
  await setEditor(WRONG);
  await page.getByRole("button", { name: /run & check/i }).click();
  // the submit handler clears any stale play-path notice; wait for the GRADING
  // feedback specifically (first graded run loads pygame-ce in the worker)
  const feedback = page.locator('[aria-label="feedback"].feedback--misconception');
  await feedback.waitFor({ timeout: 600_000 });
  const fbClass = await feedback.getAttribute("class");
  const fbText = await feedback.textContent();
  record(
    "e-misconception-warm-amber",
    fbClass.includes("feedback--misconception") &&
      !fbClass.includes("feedback--syntax") &&
      !fbClass.includes("feedback--runtime") &&
      fbText.includes("flies through the walls"),
    { fbClass, fbText },
  );
  await shot("e-misconception");

  // ---- (c) submit grades HEADLESSLY; deterministic ----------------------------
  await page.getByRole("button", { name: /try again/i }).click();
  await setEditor(CORRECT);
  const tickBase = await tick();
  await page.getByRole("button", { name: /^run$/i }).click();
  await page.waitForFunction((b) => window.__trellisFrameTick > b, tickBase, { timeout: 30_000 });
  // ensure ticking resumed before submit
  const preSubmitRate = await tickRate(800);
  await page.getByRole("button", { name: /run & check/i }).click();
  await sleep(500);
  const g0 = await tick();
  await sleep(900);
  const g1 = await tick();
  const passFeedback = page.locator('[aria-label="feedback"].feedback--pass');
  await passFeedback.waitFor({ timeout: 600_000 });
  const passClass = await passFeedback.getAttribute("class");
  record("c1-headless-grading-playback-stopped", preSubmitRate > 10 && g1 === g0 && passClass.includes("feedback--pass"), {
    preSubmitRate,
    tickDuringGrading: [g0, g1],
    passClass,
  });
  await shot("c-pass");

  // byte-identical canonicalDiagnosis across two full evaluates of the SAME submission
  const det = await page.evaluate((code) => window.__M65.doubleEvaluate(code), CORRECT);
  record("c2-determinism-correct", det.a === det.b && det.correct === true && det.attribution === "pass", {
    identical: det.a === det.b,
    attribution: det.attribution,
    bytes: det.a.length,
  });
  const detW = await page.evaluate((code) => window.__M65.doubleEvaluate(code), WRONG);
  record(
    "c3-determinism-wrong-misconception",
    detW.a === detW.b && detW.correct === false && detW.misconceptionId === "mis.m65.no_bounce_clamp",
    { identical: detW.a === detW.b, attribution: detW.attribution, misconceptionId: detW.misconceptionId },
  );
  writeFileSync(
    path.join(here, "evidence", "m65-diagnosis-correct.json"),
    JSON.stringify(JSON.parse(det.a), null, 2),
  );
  writeFileSync(
    path.join(here, "evidence", "m65-diagnosis-wrong.json"),
    JSON.stringify(JSON.parse(detW.a), null, 2),
  );
} catch (e) {
  record("FATAL", false, { error: String(e), stack: e?.stack?.split("\n").slice(0, 6) });
} finally {
  const out = { url: URL_, results, consoleLines: consoleLines.slice(-200) };
  writeFileSync(path.join(here, "evidence", "m65-pygame.json"), JSON.stringify(out, null, 2));
  await browser.close();
  server.kill();
}

const allPass = results.length > 0 && results.every((r) => r.pass);
console.log(`\nM65 DEFINING GATE: ${allPass ? "ALL PASS" : "FAILURES PRESENT"} (${results.length} checks)`);
process.exit(allPass ? 0 : 1);
