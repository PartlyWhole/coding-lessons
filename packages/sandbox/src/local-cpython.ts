import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { RunResult, RunRequest, AstQuery } from "@trellis/schema";
import { RUN_HARNESS } from "./run-harness.js";
import { parseAndMatch as runParseAndMatch, type RunFn } from "./parse-and-match.js";

// OFFLINE VERIFICATION ONLY. A faithful WARM-SERVER twin of the deferred Pyodide worker:
// one long-lived CPython child executes the SAME RUN_HARNESS per request (fresh ns per
// call, modules persist across runs — the documented warm-worker contract), so the
// differential and the ladder can be proven without network and without paying ~30ms
// interpreter startup per run. PRODUCTION path is Pyodide (sandbox.ts).
export interface LocalSandboxConfig {
  python?: string; // default "python3"
  recycleRssMb?: number; // default 512: self-retire watermark, mirroring the warm pool's mem cap
}

export interface LocalSandbox {
  run(req: RunRequest): Promise<RunResult>;
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
  dispose?(): void; // kill the warm child (tests / explicit teardown)
  serverPid?(): number | undefined; // observability for recycle tests
}

// Appended to RUN_HARNESS: the server loop. Mirrors the worker host's role — it drives
// __trellis_run per request; it never touches the harness's semantics.
//
// Wire protocol (both directions): 4-byte big-endian u32 byte length, then exactly that
// many bytes of UTF-8 JSON. Request: {id, code, entrypoint, stdin} — timeoutMs is NOT
// sent; the watchdog is host-side, mirroring spawnSync's host-side `timeout` option.
// Reply: {id, harness: <the exact JSON string __trellis_run returned>, rssMb}.
//
// fd hygiene: the protocol writer is a dup of fd 1 taken at startup, then fd 1 is parked
// on /dev/null — stray C-level stdout (pygame banner, os.write(1,...)) can never corrupt
// framing. fd 0 is likewise dup'd for the protocol reader and parked on /dev/null, with
// sys.stdin pointed at /dev/null so learner input() raises EOFError exactly like the
// spawnSync twin did (it passed input: ""). stderr stays a passthrough pipe, ring-
// buffered host-side for infra error messages.
const SERVER_LOOP = `
import os as _os, sys as _sys, json as _json, struct as _struct, resource as _resource

_proto_out = _os.fdopen(_os.dup(1), "wb", buffering=0)
_proto_in = _os.fdopen(_os.dup(0), "rb", buffering=0)
_devnull_w = _os.open(_os.devnull, _os.O_WRONLY)
_devnull_r = _os.open(_os.devnull, _os.O_RDONLY)
_os.dup2(_devnull_w, 1)   # stray C-level stdout can't corrupt framing
_os.dup2(_devnull_r, 0)   # learner C-level stdin reads see EOF
_sys.stdin = open(_os.devnull, "r")  # learner input() -> EOFError (spawnSync twin parity)

def _read_exact(n):
    buf = b""
    while len(buf) < n:
        chunk = _proto_in.read(n - len(buf))
        if not chunk:
            _sys.exit(0)  # parent gone: exit, never orphan
        buf += chunk
    return buf

while True:
    hdr = _read_exact(4)
    (_n,) = _struct.unpack(">I", hdr)
    _req = _json.loads(_read_exact(_n).decode("utf-8"))
    _harness = __trellis_run(_req["code"], _req.get("entrypoint"), _req.get("stdin"))
    _ru = _resource.getrusage(_resource.RUSAGE_SELF).ru_maxrss
    _rss_mb = _ru / (1048576 if _sys.platform == "darwin" else 1024)
    _reply = _json.dumps({"id": _req["id"], "harness": _harness, "rssMb": _rss_mb}).encode("utf-8")
    _proto_out.write(_struct.pack(">I", len(_reply)) + _reply)
`;

const DRIVER = RUN_HARNESS + SERVER_LOOP;

export function createLocalSandbox(config: LocalSandboxConfig = {}): LocalSandbox {
  const python = config.python ?? "python3";
  const recycleRssMb = config.recycleRssMb ?? 512;

  let child: ChildProcessWithoutNullStreams | null = null;
  let stdoutBuf = Buffer.alloc(0);
  let stderrTail = "";
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve(); // serializes requests (single in-flight)
  let pending: {
    id: number;
    resolve: (r: RunResult) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  const infra = (message: string): RunResult => ({
    ran: false,
    stdout: "",
    wallMs: 0,
    timedOut: false,
    error: { type: "runtime", message },
  });

  function killChild(): void {
    if (child) {
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.kill("SIGKILL");
      child = null;
    }
    stdoutBuf = Buffer.alloc(0);
  }

  function onChildDown(): void {
    // Unexpected death (crash / os._exit / spawn failure) with a request in flight.
    if (pending) {
      clearTimeout(pending.timer);
      const lines = stderrTail.trim().split("\n");
      const msg = lines[lines.length - 1] || "twin failure";
      const { resolve } = pending;
      pending = null;
      killChild();
      resolve(infra(msg));
    } else {
      killChild();
    }
  }

  function onData(chunk: Buffer): void {
    stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
    while (stdoutBuf.length >= 4) {
      const len = stdoutBuf.readUInt32BE(0);
      if (stdoutBuf.length < 4 + len) return;
      const body = stdoutBuf.subarray(4, 4 + len).toString("utf-8");
      stdoutBuf = stdoutBuf.subarray(4 + len);
      const reply = JSON.parse(body) as { id: number; harness: string; rssMb: number };
      if (!pending || reply.id !== pending.id) continue; // stale reply after a respawn
      clearTimeout(pending.timer);
      const { resolve } = pending;
      pending = null;
      if (reply.rssMb > recycleRssMb) killChild(); // self-retire AFTER serving (worker-host recycle)
      let result: RunResult;
      try {
        result = JSON.parse(reply.harness) as RunResult; // harness wallMs stays 0 (determinism)
      } catch {
        result = {
          ran: false,
          stdout: reply.harness,
          wallMs: 0,
          timedOut: false,
          error: { type: "runtime", message: "unparseable harness output" },
        };
      }
      resolve(result);
    }
  }

  function ensureChild(): ChildProcessWithoutNullStreams {
    if (child) return child;
    stderrTail = "";
    child = spawn(python, ["-c", DRIVER], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", onData);
    child.stderr.on("data", (b: Buffer) => {
      stderrTail = (stderrTail + b.toString("utf-8")).slice(-4096);
    });
    child.on("exit", onChildDown);
    child.on("error", onChildDown);
    return child;
  }

  function dispatch(req: RunRequest): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
      const c = ensureChild();
      const id = nextId++;
      const timer = setTimeout(() => {
        // Watchdog: deterministic timedOut:true, kill + respawn lazily (spawnSync parity).
        if (pending?.id !== id) return;
        pending = null;
        killChild();
        resolve({ ran: false, stdout: "", wallMs: 0, timedOut: true });
      }, req.timeoutMs);
      pending = { id, resolve, timer };
      const body = Buffer.from(
        JSON.stringify({
          id,
          code: req.code,
          entrypoint: req.entrypoint ?? null,
          stdin: req.stdin ?? null,
        }),
        "utf-8",
      );
      const frame = Buffer.alloc(4 + body.length);
      frame.writeUInt32BE(body.length, 0);
      body.copy(frame, 4);
      c.stdin.write(frame);
    });
  }

  const run = (req: RunRequest): Promise<RunResult> => {
    const p = queue.then(() => dispatch(req));
    queue = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  };

  const runFn: RunFn = run;
  return {
    run,
    parseAndMatch: (code, queries) => runParseAndMatch(runFn, code, queries),
    dispose: () => killChild(),
    serverPid: () => child?.pid,
  };
}
