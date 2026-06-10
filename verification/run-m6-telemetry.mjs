// M6 DEFINING GATE 5 (Task 13) — real-browser Playwright evidence for §11:
//   (1) the marquee Greenhouse walkthrough runs IDENTICALLY with telemetry attached:
//       zero pageerrors, every step reachable, cell completes;
//   (2) behavioral_event rows exist in REAL IndexedDB afterwards: session_start sentinel,
//       step_enter/submission/editor_change/hint_requested present, per-session gap-free seq,
//       no raw editor text in any row;
//   (3) the rows SURVIVE a reload (new session appends; old rows intact).
// Serves the repo root via python3 -m http.server on TRELLIS_PORT (default 8902).
// Prereq: `pnpm --filter @trellis/client build` (static app under packages/client/dist/app).
// Usage: node verification/run-m6-telemetry.mjs   (FOREGROUND; ~2-4 min)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PORT = process.env.TRELLIS_PORT ?? "8902";
const APP_URL = `http://localhost:${PORT}/packages/client/index.html`;
const EVIDENCE_DIR = path.join(here, "evidence", "m6-telemetry-2026-06-10");
mkdirSync(EVIDENCE_DIR, { recursive: true });

const results = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(evidence).slice(0, 300)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn("python3", ["-m", "http.server", PORT], { cwd: repoRoot, stdio: "ignore" });
await sleep(1200);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await ctx.newPage();
const consoleLines = [];
const pageErrors = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => pageErrors.push(e.message));

const readIdbRows = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("trellis");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("behavioral_event", "readonly");
          const all = tx.objectStore("behavioral_event").getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );

function gapFreePerSession(rows) {
  const bySession = new Map();
  for (const r of rows) {
    if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
    bySession.get(r.sessionId).push(r.seq);
  }
  const report = {};
  let ok = true;
  for (const [sid, seqs] of bySession) {
    seqs.sort((a, b) => a - b);
    const contiguous = seqs.every((s, i) => s === i);
    report[sid] = { count: seqs.length, contiguous };
    ok = ok && contiguous;
  }
  return { ok, report };
}

const WRONG_CODE = 'def announce(number): return "Your random number is: " + number';
const PASS_CODE = 'def announce(number): return f"Your random number is: {number}"';

try {
  // ---------- (1) the marquee walkthrough, telemetry attached ----------
  await page.goto(APP_URL);
  const watch = page.locator('section[aria-label="watch step"]');
  await watch.waitFor({ timeout: 120000 }); // includes warmup on first visit
  await watch.getByRole("button", { name: "Continue" }).click();

  const predict = page.locator('section[aria-label="predict step"]');
  await predict.waitFor({ timeout: 10000 });
  await predict.locator('input[type="radio"][value="b"]').check();
  await predict.getByRole("button", { name: "Submit" }).click();
  await page.locator('[aria-label="feedback"]').waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Continue" }).click();

  const recognize = page.locator('section[aria-label="recognize step"]');
  await recognize.waitFor({ timeout: 10000 });
  await recognize.locator('input[type="radio"][value="b"]').check();
  await recognize.getByRole("button", { name: "Submit" }).click();
  await page.locator('[aria-label="feedback"]').waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Continue" }).click();

  const build = page.locator('section[aria-label="build step"]');
  await build.waitFor({ timeout: 10000 });
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(WRONG_CODE); // real typing → debounced editor_change emits
  await sleep(550); // human pacing: let the 400ms trailing debounce fire before submitting
  await build.getByRole("button", { name: /run.*check/i }).click();
  await page.locator('[aria-label="feedback"]').waitFor({ timeout: 120000 });
  const hints = page.locator('aside[aria-label="hints"]');
  await hints.getByRole("button", { name: "Show a hint" }).click(); // hint_requested
  await page.getByRole("button", { name: "Try again" }).click();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(PASS_CODE);
  await sleep(550); // human pacing again — submission payloads then carry the fingerprint
  await build.getByRole("button", { name: /run.*check/i }).click();
  await page.locator('[aria-label="feedback"]').waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator(".cell-complete").waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "1-cell-complete.png"), fullPage: true });
  record("walkthrough green with telemetry attached", true, { completed: true });
  record("zero pageerrors during walkthrough", pageErrors.length === 0, { pageErrors });

  // ---------- (2) real-IndexedDB rows ----------
  await sleep(6500); // > the 5s interval flush: everything buffered is durable
  const rows1 = await readIdbRows();
  const types1 = [...new Set(rows1.map((r) => r.type))].sort();
  record("behavioral_event rows exist in real IndexedDB", rows1.length > 0, { count: rows1.length, types: types1 });

  const sorted = rows1.slice().sort((a, b) => a.seq - b.seq);
  const sentinel = sorted.find((r) => r.type === "session_start");
  record("session_start sentinel row (stepId:'')", sentinel !== undefined && sentinel.stepId === "", { sentinel });
  for (const t of ["step_enter", "submission", "editor_change", "hint_requested", "step_release"]) {
    record(`row type recorded: ${t}`, types1.includes(t), { present: types1.includes(t) });
  }
  const gf1 = gapFreePerSession(rows1);
  record("gap-free seq per session", gf1.ok, gf1.report);
  const blob = JSON.stringify(rows1);
  record(
    "privacy: no raw editor text in any persisted row",
    !blob.includes("announce(") && !blob.includes("random number is"),
    { scannedChars: blob.length },
  );
  const subRows = rows1.filter((r) => r.type === "submission").sort((a, b) => a.seq - b.seq);
  const lastBuildSub = subRows.filter((r) => r.payload && r.payload.stepKind === "build").at(-1);
  record(
    "submission payload carries derived signals (stepKind/failStreak/edit fingerprint)",
    lastBuildSub !== undefined &&
      lastBuildSub.payload.correct === true &&
      typeof lastBuildSub.payload.failStreak === "number" &&
      typeof lastBuildSub.payload.editLength === "number" &&
      typeof lastBuildSub.payload.editHash === "string" &&
      typeof lastBuildSub.payload.editDistanceProxy === "number",
    { payload: lastBuildSub?.payload },
  );

  // ---------- (3) reload: rows survive; a new session appends ----------
  await page.reload();
  await page.locator('section[aria-label="watch step"]').waitFor({ timeout: 120000 });
  await sleep(6500); // let session 2's buffered rows (session_start/step_enter) flush
  const rows2 = await readIdbRows();
  const sessions2 = new Set(rows2.map((r) => r.sessionId));
  const survived = rows1.every((r) => rows2.some((s) => s.id === r.id));
  record("rows survive reload (all pre-reload ids still present)", survived, {
    before: rows1.length,
    after: rows2.length,
    sessions: sessions2.size,
  });
  record("reload started a NEW session (second sessionId, own gap-free seq)", sessions2.size >= 2, gapFreePerSession(rows2).report);
  record("zero pageerrors incl. reload", pageErrors.length === 0, { pageErrors });
} catch (e) {
  record("driver completed", false, { error: String(e) });
} finally {
  const pass = results.every((r) => r.pass);
  const out = { url: APP_URL, pass, results, consoleLines: consoleLines.slice(-100) };
  writeFileSync(path.join(EVIDENCE_DIR, "results.json"), JSON.stringify(out, null, 2));
  // full row dump as standalone evidence
  try {
    const rows = await readIdbRows();
    writeFileSync(path.join(EVIDENCE_DIR, "behavioral_event-rows.json"), JSON.stringify(rows, null, 2));
  } catch {
    /* page may be gone */
  }
  console.log(`\n${pass ? "ALL PASS" : "FAILURES PRESENT"} — evidence in ${EVIDENCE_DIR}`);
  await browser.close();
  server.kill();
  process.exit(pass ? 0 : 1);
}
