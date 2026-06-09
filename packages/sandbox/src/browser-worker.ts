/**
 * Production WorkerFactory: constructs a real module Worker from a bundled worker URL.
 *
 * ⚠️ DEFERRED VERIFICATION: exercising a real Worker requires a browser (and, for the
 * worker to become ready, network access to the pinned Pyodide CDN). It is typechecked
 * here but not behavior-tested in the offline environment.
 *
 * The app/bundler is responsible for producing `workerUrl` from src/pyodide-worker.ts,
 * e.g. `new URL("./pyodide-worker.js", import.meta.url)`. That wiring is app-level.
 */
import type { WorkerFactory, WorkerLike } from "./protocol.js";

export function browserWorkerFactory(workerUrl: string | URL): WorkerFactory {
  return () => new Worker(workerUrl, { type: "module" }) as unknown as WorkerLike;
}
