import assert from "node:assert/strict";
import test from "node:test";
import { blockingAdvisories, packagesFromLockfile } from "./audit-dependencies.mjs";

test("lockfile parser collects scoped and unscoped registry versions", () => {
  const lockfile = `lockfileVersion: '9.0'
packages:
  '@scope/example@1.2.3':
    resolution: {}
  plain@4.5.6:
    resolution: {}
snapshots:
  '@scope/example@1.2.3': {}
`;
  assert.deepEqual(packagesFromLockfile(lockfile), {
    "@scope/example": ["1.2.3"],
    plain: ["4.5.6"],
  });
});

test("only high and critical advisories block a release", () => {
  const response = {
    safe: [{ severity: "moderate", title: "Moderate", url: "https://example.test/moderate" }],
    blocked: [
      { severity: "high", title: "High", url: "https://example.test/high" },
      { severity: "critical", title: "Critical", url: "https://example.test/critical" },
    ],
  };
  assert.deepEqual(blockingAdvisories(response).map((row) => row.severity), ["high", "critical"]);
});
