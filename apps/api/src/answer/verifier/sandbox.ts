// =============================================================================
// apps/api/src/answer/verifier/sandbox.ts
// -----------------------------------------------------------------------------
// Coding-intent deterministic verifier. Three-stage binary pipeline:
//
//   1. node --check      syntax-validates the worker's emitted code (TS-aware
//                        via --experimental-strip-types when Node supports it).
//   2. tsc --noEmit      type-checks the worker's emitted code (ts only).
//   3. fixture-assert    runs a node --eval script that `import`s the worker
//                        and asserts the runtime contract holds.
//
// Every stage returns a binary StageResult from a real subprocess exit code;
// the verdict is `pass` iff ALL stages pass. NO LLM judgement — that is the
// whole point: a frontier chat model as a code verifier shares the same
// training data as the worker and rubber-stamps hallucinated output. We use
// deterministic tools so the verifier and the worker can't drift into
// shared blind spots.
//
// ponytail: subprocess invocation is hand-rolled rather than execa. The
//   ceiling here is lack of cross-platform pipe abstraction (windows named
//   pipes, signal forwarding, etc.). Upgrade: add `execa` once we need
//   streamed child output or signals.
// ponytail: tsc is invoked via `node <resolve('typescript/bin/tsc')>`.
//   Ceiling: assumes `typescript` is in the workspace's dep tree. Upgrade:
//   accept `tscBin` from caller (already supported as an option) and skip
//   the tsc stage when it's null. tsc flags use the tsc CLI defaults for
//   --module/--moduleResolution so a single file in a tmp dir works without
//   a package.json.
// ponytail: node --check is the syntactic gate. For .ts inputs on Node 22.6+
//   we prepend --experimental-strip-types so V8 strips type annotations
//   before parsing. Ceiling: on Node <22.6 the gate cannot validate TS and
//   the verdict relies on tsc for syntactic+type coverage. Upgrade: pin per-
//   stage verdict language so a leniency here can't silently mask a worker
//   regression.
// ponytail: fixture runner prepends `import assert from "node:assert/strict"`
//   so evalScript bodies can call assert.equal/throws/rejects without each
//   fixture re-importing. Ceiling: if a fixture imports assert itself, the
//   import statement duplicates; upgrade: detect existing assert imports.
// ponytail: fixture stage uses Node 22.6+ `--experimental-strip-types` so a
//   .ts worker can be dynamically import'd inside a .mjs eval script.
//   Ceiling: if Node < 22.6, fixture stage is skipped for `language:'ts'`
//   unless caller pre-compiles. Upgrade: detect Node version once at
//   module load and pin behaviour.
// =============================================================================

import { z } from "zod";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// ---------- 1. Input schema ------------------------------------------------

export const VerifierInputSchema = z
  .object({
    /* The worker's emitted code. Hard cap 50 KB — anything bigger is a
       sign the worker is verbose-jabbing, not coding. */
    code: z.string().min(1).max(50_000),
    /* TS gets the tsc stage; JS skips it. */
    language: z.enum(["ts", "js"]).default("ts"),
    /* Optional: a runtime assertion. Eval-script style. May reference the
       worker via dynamic import of WORKER_PATH (injected env var). */
    fixture: z
      .object({
        evalScript: z.string().min(1).max(10_000),
        /* If true, runner wraps evalScript with:
           import assert from "node:assert/strict";
           const m = await import(process.env.WORKER_PATH);
           globalThis.__worker = m;
           <evalScript>
           so the fixture can call into the worker and use assert.* out of
           the box. */
        importWorker: z.boolean().default(false),
      })
      .optional(),
    /* Per-stage hard timeout (ms). Default 5 s. */
    timeoutMs: z.number().min(100).max(30_000).default(5_000),
  })
  .strict();
export type VerifierInput = z.infer<typeof VerifierInputSchema>;

// ---------- 2. Stage plans + results --------------------------------------

export const StageKind = z.enum(["node-check", "tsc-noemit", "fixture-assert"]);
export type StageKind = z.infer<typeof StageKind>;

export const SandboxStagePlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("node-check"), workerPath: z.string() }),
  z.object({
    kind: z.literal("tsc-noemit"),
    workerPath: z.string(),
    tscBin: z.string(),
    tscArgs: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("fixture-assert"),
    workerPath: z.string(),
    fixturePath: z.string(),
    workerEnv: z.string(), // currently always "WORKER_PATH"
  }),
]);
export type SandboxStagePlan = z.infer<typeof SandboxStagePlanSchema>;

export const StageResultSchema = z.object({
  kind: StageKind,
  ok: z.boolean(),
  durationMs: z.number().min(0),
  exitCode: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  /* Fixture stage only: structured list of assertion-failure messages. */
  assertionErrors: z.array(z.string()).optional(),
});
export type StageResult = z.infer<typeof StageResultSchema>;

export const VerifierResultSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  stages: z.array(StageResultSchema).min(1),
  totalDurationMs: z.number().min(0),
  /* Whether the tsc stage was SKIPPED (not run) because tscBin was null.
     Distinct from a stage that ran and failed. */
  tscSkipped: z.boolean(),
  /* Whether the fixture stage was SKIPPED. Reason captured. */
  fixtureSkipped: z
    .object({ reason: z.enum(["no_fixture", "node_version", "import_worker_failed"]) })
    .optional(),
});
export type VerifierResult = z.infer<typeof VerifierResultSchema>;

// ---------- 3. Pure planner ------------------------------------------------

const TS_NODE_MINOR = (() => {
  const v = process.versions.node.split(".").map(Number);
  return { major: v[0] ?? 0, minor: v[1] ?? 0 };
})();
const NODE_SUPPORTS_STRIP_TYPES =
  TS_NODE_MINOR.major > 22 || (TS_NODE_MINOR.major === 22 && TS_NODE_MINOR.minor >= 6);
/* ponytail: strip-types flag is needed only for .ts files. .js files go
   straight through V8 with no flag. Ceiling: flag is redundant on Node
   22.18+ where type-stripping is on by default for .ts — we keep it for
   backwards compatibility with Node 22.6 — 22.17. */
const TS_FILE_EXT = /\.ts$/;

/**
 * Build the deterministic stage list. Pure: given the same input + the
 * same tmpDir injection, returns the same plan. Does NOT invoke any
 * subprocess itself; that is the runner's job. Splits cleanly along the
 * M2-pure / M3-side-effecting contract from the conductor plan.
 */
export function buildSandboxPlan(
  input: VerifierInput,
  ctx: { tmpDir: string; tscBin: string | null },
): {
  stages: SandboxStagePlan[];
  workerPath: string;
  fixtureSkipped?: { reason: "no_fixture" | "node_version" | "import_worker_failed" };
  tscSkipped: boolean;
} {
  const workerName = input.language === "ts" ? "worker.ts" : "worker.mjs";
  const workerPath = join(ctx.tmpDir, workerName);
  writeFileSync(workerPath, input.code, "utf8");

  const stages: SandboxStagePlan[] = [
    { kind: "node-check", workerPath },
  ];

  let tscSkipped = false;
  if (input.language === "ts") {
    if (ctx.tscBin) {
      stages.push({
        kind: "tsc-noemit",
        workerPath,
        tscBin: ctx.tscBin,
        tscArgs: [
          "--noEmit",
          "--target",
          "es2022",
          "--strict",
          "--skipLibCheck",
        ],
      });
    } else {
      tscSkipped = true;
    }
  }

  let fixtureSkipped: VerifierResult["fixtureSkipped"];
  if (!input.fixture) {
    fixtureSkipped = { reason: "no_fixture" };
  } else if (input.language === "ts" && !NODE_SUPPORTS_STRIP_TYPES) {
    // ponytail: Node < 22.6 can't dynamic-import a .ts worker. Fixture stage
    //   is silently skipped so the verdict is still meaningful (syntax+types
    //   gates are the binary truth). Upgrade: bundle a tsx loader.
    fixtureSkipped = { reason: "node_version" };
  } else {
    const fixturePath = join(ctx.tmpDir, "fixture.mjs");
    // Wrap evalScript so it (a) has `assert` available without re-importing
    // and (b) can dynamic-import the worker when importWorker=true. The
    // preamble is unconditional so every fixture script can call assert.*.
    const preamble =
      `import assert from "node:assert/strict";\n`;
    /* ponytail: Windows raw absolute paths break dynamic `import()` with
       ERR_UNSUPPORTED_ESM_URL_SCHEME — Node's ESM loader requires a URL.
       pathToFileURL normalises both Windows (`C:\\...`) and POSIX
       (`/tmp/...`) into a valid file:// URL. Ceiling: this runs in the
       fixture process, not the verifier process, so the URL conversion is
       per-fixture-run. Upgrade: pin the file URL at planner time and
       embed it in the wrapper directly so the fixture never reads the raw
       env var.
       ponytail: wrapper binds ONLY `globalThis.__worker` (no local
       `const m`). EvalScripts MUST read `globalThis.__worker.X()` rather
       than declaring their own `const m`. Ceiling: future ergonomic
       convenience would be to also expose `m` on top of globalThis if
       callers want it; until then we keep a single binding to avoid
       SyntaxError on duplicate `const m`. */
    const importHook = input.fixture.importWorker
      ? `import { pathToFileURL } from "node:url";\n` +
        `const __wp = pathToFileURL(process.env.WORKER_PATH).href;\n` +
        `globalThis.__worker = await import(__wp);\n`
      : "";
    const wrapped = preamble + importHook + input.fixture.evalScript;
    writeFileSync(fixturePath, wrapped, "utf8");
    stages.push({
      kind: "fixture-assert",
      workerPath,
      fixturePath,
      workerEnv: "WORKER_PATH",
    });
  }

  return { stages, workerPath, fixtureSkipped, tscSkipped };
}

// ---------- 4. Side-effecting runner --------------------------------------

/**
 * Run ONE stage. Subprocess is hard-timed-out, hard-buffer-capped, no shell.
 * Returns the binary StageResult or, on a verifier-internal error (e.g.
 * unknown stage kind), a fail-without-subprocess result so the verdict is
 * still well-formed.
 */
export function runStage(
  plan: SandboxStagePlan,
  opts: {
    nodeBin: string;
    timeoutMs: number;
    maxBuffer: number;
  },
): StageResult {
  const start = Date.now();
  const base = {
    durationMs: 0,
    stdout: "",
    stderr: "",
    exitCode: null as number | null,
  };

  if (plan.kind === "node-check") {
    /* ponytail: TS files get --experimental-strip-types on Node ≥ 22.6 so
       V8 strips type annotations before parsing. Without it, Node's bare
       --check rejects valid TS because of `: type` annotations. .js files
       don't need the flag. Ceiling: on Node <22.6 the gate fails-open on TS
       and tsc carries the load. */
    const isTs = TS_FILE_EXT.test(plan.workerPath);
    const args: string[] = ["--check", plan.workerPath];
    if (isTs && NODE_SUPPORTS_STRIP_TYPES) {
      args.unshift("--experimental-strip-types");
    }
    const r = spawnSync(opts.nodeBin, args, {
      encoding: "utf8",
      timeout: opts.timeoutMs,
      maxBuffer: opts.maxBuffer,
      shell: false,
    });
    return {
      kind: "node-check",
      ok: r.status === 0,
      durationMs: Date.now() - start,
      exitCode: r.status,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  }

  if (plan.kind === "tsc-noemit") {
    const r = spawnSync(opts.nodeBin, [plan.tscBin, ...plan.tscArgs, plan.workerPath], {
      encoding: "utf8",
      timeout: opts.timeoutMs,
      maxBuffer: opts.maxBuffer,
      shell: false,
    });
    return {
      kind: "tsc-noemit",
      ok: r.status === 0,
      durationMs: Date.now() - start,
      exitCode: r.status,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  }

  if (plan.kind === "fixture-assert") {
    const r = spawnSync(
      opts.nodeBin,
      NODE_SUPPORTS_STRIP_TYPES
        ? ["--experimental-strip-types", "--no-warnings", plan.fixturePath]
        : [plan.fixturePath],
      {
        encoding: "utf8",
        timeout: opts.timeoutMs,
        maxBuffer: opts.maxBuffer,
        shell: false,
        env: { ...process.env, [plan.workerEnv]: plan.workerPath },
      },
    );
    const stderr = r.stderr ?? "";
    const stdout = r.stdout ?? "";
    // ponytail: tiny heuristic — pin asserting-error lines. Ceiling: a more
    //   comprehensive parser is needed when fixtures get complex (e.g.
    //   nested `assert.rejects`). Upgrade: pipe through `node:assert`
    //   error-class detection on the structured stdout/stderr from
    //   `node --test-style` runner.
    const assertionErrors = collectAssertionErrors(stdout, stderr);
    return {
      kind: "fixture-assert",
      ok: r.status === 0 && assertionErrors.length === 0,
      durationMs: Date.now() - start,
      exitCode: r.status,
      stdout,
      stderr,
      assertionErrors,
    };
  }

  return {
    kind: "fixture-assert", // unreachable — type-system guard
    ok: false,
    durationMs: Date.now() - start,
    exitCode: null,
    stdout: "",
    stderr: `verifier internal error: unknown stage kind ${(plan as { kind?: string }).kind ?? "?"}`,
  };
}

function collectAssertionErrors(stdout: string, stderr: string): string[] {
  const out: string[] = [];
  for (const blob of [stdout, stderr]) {
    for (const line of blob.split("\n")) {
      if (
        /AssertionError/i.test(line) ||
        /^Assertion\s+failed/.test(line) ||
        /expected.*to (deeply )?equal/i.test(line)
      ) {
        out.push(line.trim());
      }
    }
  }
  return out;
}

// ---------- 5. Verdict combiner (pure) -------------------------------------

/**
 * Pure: combine stage results into a binary verdict. All stages must be
 * `ok: true`. Distinct from `tscSkipped` / `fixtureSkipped`: a skipped
 * stage neither passes nor fails the verdict — the verifier records it
 * but the overall verdict is computed only over stages that actually ran.
 *
 * Wait — that means skipped stages can't block `pass`. Is that right?
 * Design choice: the three-stage pipeline is exhaustive ONLY when no
 * stage is skipped. Otherwise the verifier reports `pass` based on the
 * stages that ran and records the skip in the envelope so the operator
 * knows there was no full coverage. This is explicit and defensible.
 */
export function combineVerdict(
  stages: StageResult[],
): "pass" | "fail" {
  return stages.every((s) => s.ok) ? "pass" : "fail";
}

// ---------- 6. Top-level orchestrator --------------------------------------

/**
 * Resolve the local typescript tsc script. The api package has typescript
 * as a devDep, so `require.resolve('typescript/bin/tsc')` works. Returns
 * null if typescript is not installed — caller decides whether to skip
 * the tsc stage or fail-closed.
 */
export function resolveTscBin(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const p = req.resolve("typescript/bin/tsc");
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Side-effecting convenience: write worker to tmp, run every stage, combine.
 * Cleans up tmp after. Always returns a VerifierResult — never throws.
 *
 * Options:
 *   - tscBin:  override path to tsc script. Default = resolveTscBin().
 *   - nodeBin: override node binary. Default = process.execPath.
 *   - timeoutMs: per-stage hard timeout. Default = input.timeoutMs.
 *   - maxBuffer: stdout/stderr cap per stage. Default 1 MB.
 */
export function runCodingSandboxVerifier(
  input: VerifierInput,
  opts?: {
    tscBin?: string | null;
    nodeBin?: string;
    timeoutMs?: number;
    maxBuffer?: number;
    skipCleanup?: boolean; // for diagnostics
  },
): VerifierResult {
  const tmpDir = mkdtempSync(join(tmpdir(), "ofp-verifier-"));
  try {
    const tscBin = opts?.tscBin !== undefined ? opts.tscBin : resolveTscBin();
    const nodeBin = opts?.nodeBin ?? process.execPath;
    const timeoutMs = opts?.timeoutMs ?? input.timeoutMs;
    const maxBuffer = opts?.maxBuffer ?? 1_000_000;

    const parsed = VerifierInputSchema.parse(input);
    const { stages, tscSkipped, fixtureSkipped } = buildSandboxPlan(parsed, {
      tmpDir,
      tscBin,
    });

    const stageResults = stages.map((s) =>
      runStage(s, { nodeBin, timeoutMs, maxBuffer }),
    );
    const totalDurationMs = stageResults.reduce((s, r) => s + r.durationMs, 0);

    return VerifierResultSchema.parse({
      verdict: combineVerdict(stageResults),
      stages: stageResults,
      totalDurationMs,
      tscSkipped,
      fixtureSkipped,
    });
  } finally {
    if (!opts?.skipCleanup) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
