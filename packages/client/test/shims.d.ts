// Minimal ambient types for the client test + app build. @types/node is unavailable here
// (and pulling it in would override the per-package shim pattern that @trellis/sandbox,
// @trellis/authoring, and @trellis/engine rely on — specifically, real @types/node types
// SpawnSyncReturns.error as `Error`, which is incompatible with sandbox's local-cpython
// `isTimeout({ error?: { code?: string } })` guard and breaks the deep-compile). So we mirror
// the per-package shim: declare just the node builtins the client test + deep-compiled
// dependency sources actually use. `console`/`crypto`/`URL` come from the DOM lib.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
declare module "node:crypto" {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}
declare module "node:child_process" {
  // Deep-compiles BOTH @trellis/authoring's and @trellis/sandbox's sources, which call
  // spawnSync with differing encodings ("utf8" vs "utf-8") and read .error.code. One ambient
  // declaration must satisfy every call site, so the signature is the permissive union of both.
  interface SpawnSyncReturn {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: { code?: string; message?: string };
  }
  export function spawnSync(
    command: string,
    args: ReadonlyArray<string>,
    options: {
      input?: string;
      encoding?: "utf8" | "utf-8" | "buffer";
      timeout?: number;
      maxBuffer?: number;
      cwd?: string;
    },
  ): SpawnSyncReturn;
  // The loadContent test shells out to the authoring CLI via execSync.
  export function execSync(command: string, options?: { stdio?: "ignore" | "inherit" | "pipe" }): string;
}
declare module "js-yaml" {
  export function load(input: string): unknown;
  export function loadAll(input: string): unknown[];
}

declare const process: {
  argv: string[];
  exitCode: number | undefined;
  exit(code?: number): never;
  cwd(): string;
  env: Record<string, string | undefined>;
  stdout: { write(s: string): boolean };
  stderr: { write(s: string): boolean };
};
declare const Buffer: { from(s: string, enc?: string): { toString(enc: string): string } };
declare const __dirname: string;
