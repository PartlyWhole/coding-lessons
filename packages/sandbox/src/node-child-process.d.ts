// Minimal ambient declarations for node:child_process, node:url, node:path.
// Only the overloads used by local-cpython.ts and the test fixtures are declared here.
// This avoids a @types/node dependency in an otherwise browser-targeted package.
declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: { code?: string };
  }
  export interface SpawnSyncOptions {
    input?: string;
    encoding?: "utf-8" | "buffer";
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
  export function spawnSync(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnSyncOptions,
  ): SpawnSyncResult;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}
