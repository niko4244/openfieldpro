import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OPERATION_STATES } from "../src/operations.ts";

test("the operations contract source matches its versioned digest", () => {
  const source = readFileSync(new URL("../src/operations.ts", import.meta.url));
  const manifest = JSON.parse(
    readFileSync(new URL("../operations-contract.v1.json", import.meta.url), "utf8"),
  );

  assert.equal(manifest.contractVersion, "v1");
  assert.equal(manifest.sourcePath, "packages/shared/src/operations.ts");
  assert.equal(createHash("sha256").update(source).digest("hex"), manifest.sourceSha256);
});

test("the operations contract exposes only canonical lifecycle states", () => {
  assert.deepEqual(OPERATION_STATES, [
    "queued",
    "preflight",
    "maintenance",
    "capturing",
    "encrypting",
    "verifying",
    "replicating",
    "validating",
    "committing",
    "rolling_back",
    "succeeded",
    "failed",
  ]);
});
