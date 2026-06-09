// Minimal ambient declarations for node:child_process.
// Only the spawnSync overload used by local-cpython.ts is declared here.
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
  }
  export function spawnSync(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnSyncOptions,
  ): SpawnSyncResult;
}
