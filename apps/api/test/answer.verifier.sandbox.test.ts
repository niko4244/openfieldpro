// =============================================================================
// apps/api/test/answer.verifier.sandbox.test.ts
// -----------------------------------------------------------------------------
// Offline unit tests for the deterministic coding verifier.
//
// Run:   cd openfieldpro-app && pnpm --filter @ofp/api exec node --import tsx --test test/answer.verifier.sandbox.test.ts
// Live:  cd openfieldpro-app && pnpm --filter @ofp/api exec node --import tsx test/answer.verifier.sandbox.smoke.ts
//        (the smoke file forks real subprocesses; opt-in)
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  VerifierInputSchema,
  VerifierResultSchema,
  SandboxStagePlanSchema,
  buildSandboxPlan,
  combineVerdict,
  resolveTscBin,
} from "../src/answer/verifier/sandbox.ts";

// ---------- Schema regression ----------------------------------------------

test("VerifierInputSchema rejects extra fields (strict)", () => {
  const raw = {
    code: "x",
    language: "ts",
    model: "qwen3",
  };
  const r = VerifierInputSchema.safeParse(raw);
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error.message, /unrecognized|Unexpected/i);
});

test("VerifierInputSchema rejects oversized code", () => {
  const big = "x".repeat(50_001);
  const r = VerifierInputSchema.safeParse({ code: big, language: "ts" });
  assert.equal(r.success, false);
});

test("VerifierInputSchema rejects language outside ts|js", () => {
  const r = VerifierInputSchema.safeParse({ code: "x", language: "py" });
  assert.equal(r.success, false);
});

test("VerifierInputSchema defaults language to 'ts'", () => {
  const parsed = VerifierInputSchema.parse({ code: "x" });
  assert.equal(parsed.language, "ts");
});

test("VerifierInputSchema accepts minimal input (only code)", () => {
  const parsed = VerifierInputSchema.parse({ code: "export const x=1" });
  assert.equal(parsed.code, "export const x=1");
  assert.equal(parsed.language, "ts");
  assert.equal(parsed.timeoutMs, 5_000);
});

// ---------- buildSandboxPlan: planner -------------------------------------

test("buildSandboxPlan writes the worker file to the tmpDir", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const src = "export const answer = () => 42;";
    const { workerPath } = buildSandboxPlan(
      VerifierInputSchema.parse({ code: src, language: "ts" }),
      { tmpDir: tmp, tscBin: null },
    );
    assert.ok(existsSync(workerPath), "worker file must exist");
    assert.equal(readFileSync(workerPath, "utf8"), src);
    assert.ok(workerPath.endsWith("worker.ts"), "ts worker must end in worker.ts");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: js worker uses .mjs extension", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { workerPath } = buildSandboxPlan(
      VerifierInputSchema.parse({ code: "export const x=1;", language: "js" }),
      { tmpDir: tmp, tscBin: null },
    );
    assert.ok(workerPath.endsWith("worker.mjs"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: ts input without tscBin produces 1 stage + tscSkipped", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages, tscSkipped, fixtureSkipped } = buildSandboxPlan(
      VerifierInputSchema.parse({ code: "export const x=1", language: "ts" }),
      { tmpDir: tmp, tscBin: null },
    );
    assert.equal(stages.length, 1);
    assert.equal(stages[0].kind, "node-check");
    assert.equal(tscSkipped, true);
    assert.deepEqual(fixtureSkipped, { reason: "no_fixture" });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: ts input WITH tscBin produces 2 stages", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages, tscSkipped } = buildSandboxPlan(
      VerifierInputSchema.parse({ code: "export const x=1", language: "ts" }),
      { tmpDir: tmp, tscBin: "/fake/tsc" },
    );
    assert.equal(stages.length, 2);
    assert.equal(stages[0].kind, "node-check");
    assert.equal(stages[1].kind, "tsc-noemit");
    assert.equal(tscSkipped, false);
    for (const s of stages) {
      SandboxStagePlanSchema.parse(s);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: js input never produces a tsc stage", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages, tscSkipped } = buildSandboxPlan(
      VerifierInputSchema.parse({ code: "export const x=1;", language: "js" }),
      { tmpDir: tmp, tscBin: "/fake/tsc" },
    );
    assert.equal(stages.length, 1);
    assert.equal(stages[0].kind, "node-check");
    assert.equal(tscSkipped, false); // tsc not relevant for js, not skipped
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: fixture stage is added when fixture provided", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages, fixtureSkipped } = buildSandboxPlan(
      VerifierInputSchema.parse({
        code: "export const x=1",
        language: "js",
        fixture: { evalScript: "assert.equal(2+2,4)", importWorker: false },
      }),
      { tmpDir: tmp, tscBin: null },
    );
    assert.equal(stages.length, 2);
    assert.equal(stages[1].kind, "fixture-assert");
    assert.equal(fixtureSkipped, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: fixture wrapper pre-imports assert for caller use", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages } = buildSandboxPlan(
      VerifierInputSchema.parse({
        code: "export const x=1",
        language: "js",
        fixture: { evalScript: "assert.equal(2+2,4)", importWorker: false },
      }),
      { tmpDir: tmp, tscBin: null },
    );
    assert.equal(stages[1].kind, "fixture-assert");
    if (stages[1].kind === "fixture-assert") {
      const wrapped = readFileSync(stages[1].fixturePath, "utf8");
      // ponytail: assert is auto-prepended so fixtures don't need to import
      //   it. Ceiling: if a fixture imports assert itself, the import
      //   statement duplicates. Upgrade: detect existing assert imports.
      assert.ok(
        wrapped.includes('import assert from "node:assert/strict"'),
        "fixture wrapper must auto-import assert so caller scripts have it in scope",
      );
      assert.ok(wrapped.includes("assert.equal(2+2,4)"), "raw evalScript must be present");
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: fixture wrapper injects dynamic import when importWorker=true", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages } = buildSandboxPlan(
      VerifierInputSchema.parse({
        code: "export const x = () => 42;",
        language: "js",
        fixture: { evalScript: "assert.equal(globalThis.__worker.x(), 42)", importWorker: true },
      }),
      { tmpDir: tmp, tscBin: null },
    );
    assert.equal(stages[1].kind, "fixture-assert");
    if (stages[1].kind === "fixture-assert") {
      const wrapped = readFileSync(stages[1].fixturePath, "utf8");
      assert.ok(wrapped.includes("await import"), "wrapper must dynamic-import worker");
      assert.ok(wrapped.includes("pathToFileURL"), "wrapper must normalise Windows path to file:// URL");
      assert.ok(wrapped.includes("globalThis.__worker = await import"), "wrapper must bind worker to globalThis.__worker (not a local const)");
      assert.ok(wrapped.includes("assert.equal(globalThis.__worker.x(), 42)"), "fixture body must be present");
      // ponytail: regression-sentinel — a future revert to a local `const m`
      //   breaks because every evalScript that ALSO declares `const m` would
      //   hit SyntaxError. Pinning the verbatim binding form here pins it.
      assert.ok(!/^const m = await import/m.test(wrapped), "wrapper must NOT bind a local `const m` (would collide with caller redeclarations)");
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: fixture WITHOUT importWorker does not wrap with dynamic import", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages } = buildSandboxPlan(
      VerifierInputSchema.parse({
        code: "export const x=1;",
        language: "js",
        fixture: { evalScript: "if (2+2!==4) throw new Error('bad math')", importWorker: false },
      }),
      { tmpDir: tmp, tscBin: null },
    );
    if (stages[1].kind === "fixture-assert") {
      const wrapped = readFileSync(stages[1].fixturePath, "utf8");
      assert.ok(!wrapped.includes("await import"), "no import wrapper when importWorker=false");
      assert.ok(wrapped.includes("if (2+2!==4)"), "raw evalScript must be present");
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildSandboxPlan: tsc default flags drop nodenext resolution (so files without package.json work)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ofp-v-test-"));
  try {
    const { stages } = buildSandboxPlan(
      VerifierInputSchema.parse({ code: "export const x=1", language: "ts" }),
      { tmpDir: tmp, tscBin: "/fake/tsc" },
    );
    const tsc = stages[1];
    assert.ok(tsc.kind === "tsc-noemit");
    // ponytail: we deliberately do NOT pass --module / --moduleResolution.
    //   nodenext resolution requires a package.json in the file's dir;
    //   bundler resolution is fine but node10/commonjs defaults work for
    //   single-file checks. Let the tsc binary default to commonjs+node.
    assert.ok(
      !tsc.tscArgs.includes("--module") && !tsc.tscArgs.includes("--moduleResolution"),
      "tsc default args must not include nodenext-style flags (would require package.json)",
    );
    assert.ok(tsc.tscArgs.includes("--noEmit"), "tsc default args must include --noEmit");
    assert.ok(tsc.tscArgs.includes("--target"), "tsc default args must include --target");
    assert.ok(tsc.tscArgs.includes("--strict"), "tsc default args must include --strict");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- combineVerdict -----------------------------------------------

test("combineVerdict: all-pass -> 'pass'", () => {
  const stages = [
    { kind: "node-check", ok: true, durationMs: 1, exitCode: 0, stdout: "", stderr: "" },
    { kind: "tsc-noemit", ok: true, durationMs: 1, exitCode: 0, stdout: "", stderr: "" },
    { kind: "fixture-assert", ok: true, durationMs: 1, exitCode: 0, stdout: "", stderr: "" },
  ];
  assert.equal(combineVerdict(stages), "pass");
});

test("combineVerdict: any-fail -> 'fail' (node-check)", () => {
  const stages = [
    { kind: "node-check", ok: false, durationMs: 1, exitCode: 1, stdout: "", stderr: "x" },
    { kind: "tsc-noemit", ok: true, durationMs: 1, exitCode: 0, stdout: "", stderr: "" },
  ];
  assert.equal(combineVerdict(stages), "fail");
});

test("combineVerdict: any-fail -> 'fail' (tsc-noemit)", () => {
  const stages = [
    { kind: "node-check", ok: true, durationMs: 1, exitCode: 0, stdout: "", stderr: "" },
    { kind: "tsc-noemit", ok: false, durationMs: 1, exitCode: 2, stdout: "", stderr: "TS2" },
  ];
  assert.equal(combineVerdict(stages), "fail");
});

test("combineVerdict: any-fail -> 'fail' (fixture-assert)", () => {
  const stages = [
    { kind: "fixture-assert", ok: false, durationMs: 1, exitCode: 1, stdout: "", stderr: "" },
  ];
  assert.equal(combineVerdict(stages), "fail");
});

test("combineVerdict: empty stages -> 'pass' (vacuous; verifier should never emit)", () => {
  assert.equal(combineVerdict([]), "pass");
});

// ---------- resolveTscBin -------------------------------------------------

test("resolveTscBin: returns string|null (does not throw)", () => {
  assert.doesNotThrow(() => resolveTscBin());
  const r = resolveTscBin();
  if (r !== null) {
    assert.ok(r.endsWith("tsc") || r.endsWith("tsc.js"), `unexpected tsc path: ${r}`);
  }
});

// ---------- VerifierResultSchema roundtrip --------------------------------

test("VerifierResultSchema accepts a fully-formed pass envelope", () => {
  const envelope = {
    verdict: "pass",
    stages: [
      {
        kind: "node-check",
        ok: true,
        durationMs: 12,
        exitCode: 0,
        stdout: "",
        stderr: "",
      },
    ],
    totalDurationMs: 12,
    tscSkipped: true,
    fixtureSkipped: { reason: "no_fixture" },
  };
  const parsed = VerifierResultSchema.parse(envelope);
  assert.equal(parsed.verdict, "pass");
  assert.equal(parsed.tscSkipped, true);
});
