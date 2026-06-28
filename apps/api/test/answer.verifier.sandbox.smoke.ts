// =============================================================================
// apps/api/test/answer.verifier.sandbox.smoke.ts
// -----------------------------------------------------------------------------
// Opt-in smoke test for the deterministic coding verifier. Runs REAL
// subprocesses (node --check, node tsc --noEmit, node --eval fixture).
// Exit-code driven — no LLM.
//
// Run: cd openfieldpro-app && pnpm --filter @ofp/api exec node --import tsx test/answer.verifier.sandbox.smoke.ts
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runCodingSandboxVerifier,
  resolveTscBin,
} from "../src/answer/verifier/sandbox.ts";

const TSC_BIN = resolveTscBin();
const NODE_VERSION = process.versions.node;
const HAS_STRIP_TYPES =
  Number(process.versions.node.split(".")[0]) > 22 ||
  (Number(process.versions.node.split(".")[0]) === 22 &&
    Number(process.versions.node.split(".")[1]) >= 6);

console.log(`[smoke] node=${NODE_VERSION}  tsc=${TSC_BIN ?? "null"}  strip-types=${HAS_STRIP_TYPES}`);

// ---------- 1. PASS — clean TS, all 3 stages ----------------------------

test("smoke PASS: clean TS, fixture asserts worker exports a function", () => {
  if (!HAS_STRIP_TYPES) {
    console.log("[smoke] skip: node < 22.6 does not support --experimental-strip-types");
    return;
  }
  const r = runCodingSandboxVerifier({
    code: `export function answer(): number { return 42; }\n`,
    language: "ts",
    fixture: {
      evalScript: `assert.equal(typeof globalThis.__worker.answer, "function"); assert.equal(globalThis.__worker.answer(), 42);\n`,
      importWorker: true,
    },
    timeoutMs: 5000,
  });
  console.log("[smoke] PASS fixture envelope:", JSON.stringify({
    verdict: r.verdict,
    stages: r.stages.map((s) => ({ kind: s.kind, ok: s.ok, exit: s.exitCode, durMs: s.durationMs })),
    tscSkipped: r.tscSkipped,
    fixtureSkipped: r.fixtureSkipped,
    totalMs: r.totalDurationMs,
  }, null, 2));
  assert.equal(r.verdict, "pass");
  for (const s of r.stages) assert.equal(s.ok, true, `stage ${s.kind} must be ok`);
  assert.equal(r.tscSkipped, false);
  assert.equal(r.fixtureSkipped, undefined);
});

// ---------- 2. FAIL — runtime fixture assertion fails -------------------

test("smoke FAIL_fixture: clean TS, passes types, but runtime fixture throws", () => {
  if (!HAS_STRIP_TYPES) {
    console.log("[smoke] skip: node < 22.6 does not support --experimental-strip-types");
    return;
  }
  const r = runCodingSandboxVerifier({
    code: `export function answer(): number { return 0; /* wrong: should be 42 */ }\n`,
    language: "ts",
    fixture: {
      evalScript: `assert.equal(globalThis.__worker.answer(), 42, "expected answer() to return 42");\n`,
      importWorker: true,
    },
    timeoutMs: 5000,
  });
  console.log("[smoke] FAIL_fixture stderr:", (r.stages.find((s) => s.kind === "fixture-assert")?.stderr ?? "").slice(0, 250));
  console.log("[smoke] FAIL_fixture stdout:", (r.stages.find((s) => s.kind === "fixture-assert")?.stdout ?? "").slice(0, 250));
  console.log("[smoke] FAIL_fixture assertionErrors:", r.stages.find((s) => s.kind === "fixture-assert")?.assertionErrors);
  assert.equal(r.verdict, "fail");
  const fx = r.stages.find((s) => s.kind === "fixture-assert");
  assert.ok(fx);
  assert.equal(fx!.ok, false, "fixture must fail when assertion mismatches");
  assert.ok(
    !!(fx!.assertionErrors && fx!.assertionErrors.length > 0) || fx!.exitCode !== 0,
    "fixture must capture assertion error OR non-zero exit",
  );
});

// ---------- 3. FAIL — syntax error on JS path (V8 actually catches) -----

test("smoke FAIL_nodecheck: pure-JS syntax error trips `node --check`", () => {
  // ponytail: this fixture is language='js' (not 'js') because Node 22.18's
  //   type-stripping on .ts makes several malformed TS fixtures parse as
  //   valid JS. For .mjs there is no type-strip mode and V8 reliably catches
  //   an unbalanced expression. This pins the syntactic gate end-to-end.
  const r = runCodingSandboxVerifier({
    code: `export const x = (1 + 2;\n`, // missing closing paren — V8 must reject
    language: "js",
    timeoutMs: 5000,
  });
  console.log("[smoke] FAIL_nodecheck node-check stderr:", r.stages[0].stderr.slice(0, 300));
  assert.equal(r.verdict, "fail");
  assert.equal(r.stages[0].kind, "node-check");
  assert.equal(r.stages[0].ok, false);
  assert.notEqual(r.stages[0].exitCode, 0, "node --check must exit non-zero on bad JS syntax");
});

// ---------- 4. FAIL — type error in worker ------------------------------

test("smoke FAIL_tsc: worker has type error, tsc stage fails (skip if no tsc)", () => {
  if (!TSC_BIN) {
    console.log("[smoke] skip: no tsc binary in workspace");
    return;
  }
  const r = runCodingSandboxVerifier({
    code: `export const n: number = "this is a string, not a number";\n`,
    language: "ts",
    timeoutMs: 5000,
  });
  const tsc = r.stages.find((s) => s.kind === "tsc-noemit");
  console.log("[smoke] FAIL_tsc tsc stderr:", (tsc?.stderr ?? "").slice(0, 400));
  console.log("[smoke] FAIL_tsc tsc stdout:", (tsc?.stdout ?? "").slice(0, 200));
  console.log("[smoke] FAIL_tsc node-check stderr:", (r.stages.find((s) => s.kind === "node-check")?.stderr ?? "").slice(0, 200));
  assert.equal(r.verdict, "fail");
  assert.ok(tsc, "tsc stage must run when tscBin available");
  assert.equal(tsc!.ok, false, "tsc must fail on type error");
  assert.notEqual(tsc!.exitCode, 0, "tsc must exit non-zero on type error");
  // tsc emits error codes like TS2322 (type mismatch). Match any TS\d{4,5}.
  assert.match(tsc!.stderr + tsc!.stdout, /TS\d{4,5}/, "tsc must emit a TS error code");
});

// ---------- 5. JS path — no tsc stage, plain JS fixture ----------------

test("smoke js path: js skips tsc, plain fixture runs and assert works", () => {
  const r = runCodingSandboxVerifier({
    code: `export function square(n) { return n*n; }\n`,
    language: "js",
    fixture: {
      evalScript: `assert.equal(globalThis.__worker.square(7), 49);\n`,
      importWorker: true,
    },
    timeoutMs: 5000,
  });
  console.log("[smoke] js-path:", JSON.stringify({
    verdict: r.verdict,
    stages: r.stages.map((s) => ({ kind: s.kind, ok: s.ok, durMs: s.durationMs, exit: s.exitCode })),
    tscSkipped: r.tscSkipped,
  }, null, 2));
  assert.equal(r.verdict, "pass");
  assert.equal(r.stages.find((s) => s.kind === "tsc-noemit"), undefined);
  assert.equal(r.stages.find((s) => s.kind === "node-check")?.ok, true);
  const fx = r.stages.find((s) => s.kind === "fixture-assert");
  assert.equal(fx?.ok, true, "fixture-assert must pass (assert is auto-prepended)");
});
