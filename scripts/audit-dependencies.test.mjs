import assert from "node:assert/strict";
import test from "node:test";
import { applyExceptions, blockingAdvisories, loadExceptions, packagesFromLockfile } from "./audit-dependencies.mjs";

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

test("loadExceptions rejects malformed exception records", () => {
  assert.throws(() => loadExceptions('{"nope": 1}'), /must be a JSON array/);
  assert.throws(
    () => loadExceptions('[{"ghsa": "GHSA-abc", "owner": "x", "expiresAt": "2027-01-01", "package": "p", "version": "1.0.0", "compensatingControl": "c"}]'),
    /missing a non-empty "rationale"/,
  );
});

test("applyExceptions removes covered findings and reports the rest", () => {
  const blocking = [
    { packageName: "image-size", severity: "high", title: "ICNS", url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr" },
    { packageName: "other", severity: "high", title: "Real", url: "https://github.com/advisories/GHSA-real-1" },
  ];
  const exceptions = [
    {
      ghsa: "GHSA-w3rx-r6r6-pgpr",
      package: "image-size",
      version: "1.2.1",
      rationale: "no fix",
      compensatingControl: "not shipped",
      owner: "owner",
      expiresAt: "2999-01-01",
    },
  ];
  const { remaining, applied } = applyExceptions(blocking, exceptions, { "image-size": ["1.2.1"] }, new Date("2026-01-01"));
  assert.deepEqual(remaining.map((row) => row.packageName), ["other"]);
  assert.deepEqual(applied.map((row) => row.ghsa), ["GHSA-w3rx-r6r6-pgpr"]);
});

test("applyExceptions fails on expired exceptions", () => {
  const blocking = [{ packageName: "image-size", severity: "high", url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr" }];
  const exceptions = [
    {
      ghsa: "GHSA-w3rx-r6r6-pgpr",
      package: "image-size",
      version: "1.2.1",
      rationale: "no fix",
      compensatingControl: "not shipped",
      owner: "owner",
      expiresAt: "2025-01-01",
    },
  ];
  assert.throws(() => applyExceptions(blocking, exceptions, { "image-size": ["1.2.1"] }, new Date("2026-01-01")), /expired/);
});

test("applyExceptions fails when an exception references a version no longer in the lockfile", () => {
  const blocking = [{ packageName: "image-size", severity: "high", url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr" }];
  const exceptions = [
    {
      ghsa: "GHSA-w3rx-r6r6-pgpr",
      package: "image-size",
      version: "1.2.1",
      rationale: "no fix",
      compensatingControl: "not shipped",
      owner: "owner",
      expiresAt: "2999-01-01",
    },
  ];
  assert.throws(() => applyExceptions(blocking, exceptions, { "image-size": ["2.0.2"] }), /no longer in the lockfile/);
});

test("applyExceptions fails on stale exceptions that no longer match a blocking advisory", () => {
  const exceptions = [
    {
      ghsa: "GHSA-w3rx-r6r6-pgpr",
      package: "image-size",
      version: "1.2.1",
      rationale: "no fix",
      compensatingControl: "not shipped",
      owner: "owner",
      expiresAt: "2999-01-01",
    },
  ];
  assert.throws(() => applyExceptions([], exceptions, { "image-size": ["1.2.1"] }), /stale dependency exception/);
});
