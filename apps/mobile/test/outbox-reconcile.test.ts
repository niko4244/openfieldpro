import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareOutbox,
  reconcileOutbox,
} from "../src/outbox-reconcile.ts";

test("valid outbox rows become operations while corrupt rows are quarantined", () => {
  const prepared = prepareOutbox([
    {
      op_id: "valid-1",
      kind: "measurement.create",
      payload_json: JSON.stringify({ value: "5.2" }),
      attempts: 0,
    },
    {
      op_id: "bad-json",
      kind: "session.patch",
      payload_json: "{not-json",
      attempts: 2,
    },
    {
      op_id: "not-object",
      kind: "correction.create",
      payload_json: "[]",
      attempts: 0,
    },
  ]);

  assert.deepEqual(prepared.operations, [
    {
      opId: "valid-1",
      kind: "measurement.create",
      payload: { value: "5.2" },
    },
  ]);
  assert.deepEqual(
    prepared.actions.map((action) => ({ type: action.type, opId: action.opId })),
    [
      { type: "quarantine", opId: "bad-json" },
      { type: "quarantine", opId: "not-object" },
    ],
  );
});

test("every submitted operation receives exactly one reconciliation action", () => {
  const submitted = [
    { opId: "ok", kind: "measurement.create", payload: {} },
    { opId: "conflict", kind: "session.patch", payload: {} },
    { opId: "failed", kind: "correction.create", payload: {} },
    { opId: "missing", kind: "measurement.create", payload: {} },
  ];

  const actions = reconcileOutbox(submitted, [
    { opId: "ok", ok: true },
    { opId: "conflict", ok: false, conflict: { currentVersion: 7 } },
    { opId: "failed", ok: false, error: "rejected by policy" },
    { opId: "unknown-result", ok: true },
  ]);

  assert.deepEqual(actions, [
    { type: "delete", opId: "ok" },
    { type: "fail", opId: "conflict", error: "conflict: server version 7" },
    { type: "fail", opId: "failed", error: "rejected by policy" },
    { type: "fail", opId: "missing", error: "server did not acknowledge this operation" },
  ]);
});

test("duplicate and unknown server results cannot create duplicate actions", () => {
  const submitted = [{ opId: "one", kind: "measurement.create", payload: {} }];
  assert.deepEqual(
    reconcileOutbox(submitted, [
      { opId: "one", ok: true },
      { opId: "one", ok: false, error: "late duplicate" },
      { opId: "unknown", ok: true },
    ]),
    [{ type: "delete", opId: "one" }],
  );
});

test("stored server errors are bounded and control characters are removed", () => {
  const submitted = [{ opId: "one", kind: "measurement.create", payload: {} }];
  const noisy = `bad\nerror\u0000${"x".repeat(600)}`;
  const [action] = reconcileOutbox(submitted, [{ opId: "one", ok: false, error: noisy }]);
  assert.equal(action.type, "fail");
  if (action.type === "fail") {
    assert.equal(action.error.includes("\n"), false);
    assert.equal(action.error.includes("\u0000"), false);
    assert.equal(action.error.length, 500);
  }
});

test("malformed batch results fail explicitly", () => {
  assert.throws(
    () => reconcileOutbox([], undefined as unknown as []),
    /did not contain a results array/,
  );
});
