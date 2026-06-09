// Generic Playwright runner: serves nothing itself (expects python -m http.server
// already running on :8765 at the repo root), navigates to the given page, waits
// for window.__<FLAG>_DONE__, and prints window.__<FLAG>_RESULTS__ as JSON.
// Usage: node run-page.mjs <path-from-repo-root> <FLAG> [timeoutMs]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [pagePath, flag, timeoutArg] = process.argv.slice(2);
const timeout = Number(timeoutArg ?? 180000);
const port = process.env.TRELLIS_PORT ?? "8765";
const url = `http://localhost:${port}/${pagePath}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(url);
await page.waitForFunction((f) => globalThis[`__${f}_DONE__`] === true, flag, { timeout });
const results = await page.evaluate((f) => globalThis[`__${f}_RESULTS__`], flag);

const out = { url, results, consoleLines };
writeFileSync(new URL(`./evidence/${flag.toLowerCase()}.json`, import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
