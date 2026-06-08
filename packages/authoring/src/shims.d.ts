// Minimal ambient types — @types/node and @types/js-yaml are unavailable offline.
// `console` comes from the DOM lib (tsconfig.base lib includes "DOM").

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string): string;
}
declare module "node:crypto" {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}
declare module "node:child_process" {
  interface SpawnSyncReturn {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }
  export function spawnSync(
    command: string,
    args: string[],
    options: {
      input?: string;
      encoding: "utf8";
      timeout?: number;
      maxBuffer?: number;
      cwd?: string;
    },
  ): SpawnSyncReturn;
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
