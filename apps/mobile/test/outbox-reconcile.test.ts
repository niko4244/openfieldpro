import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OFFLINE_BATCH_BYTES,
  MAX_OFFLINE_BATCH_OPERATIONS,
  prepareOutbox,
  reconcileOutbox,
  serializeOfflineOperation,
} from "../src/outbox-reconcile.ts";

function row(
  opId: string,
  kind = "measurement.create",
  payload: Record<string, unknown> | string = {},
) {
  return {
    op_id: opId,
    kind,
    payload_json: typeof payload === "string" ? payload : JSON.stringify(payload),
    attempts: 0,
  };
}

test("new offline operations are validated before local storage", () => {
  assert.equal(
    serializeOfflineOperation({
      opId: "measurement:1",
      kind: "measurement.create",
      payload: { value: "5.2" },
    }),
    JSON.stringify({ value: "5.2" }),
  );
  assert.throws(
    () =>
      serializeOfflineOperation({
        opId: "measurement:oversized",
        kind: "measurement.create",
        payload: { value: "x".repeat(250_001) },
      }),
    /250 KB/,
  );
  assert.throws(
    () =>
      serializeOfflineOperation({
        opId: "unsupported",
        kind: "admin.delete",
        payload: {},
      }),
    /kind is not supported/,
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(
    () => serializeOfflineOperation({ opId: "cyclic", kind: "session.patch", payload: cyclic }),
    /could not be serialized/,
  );
});

test("valid outbox rows become operations while corrupt rows are quarantined", () => {
  const prepared = prepareOutbox([
    row("valid-1", "measurement.create", { value: "5.2" }),
    row("bad-json", "session.patch", "{not-json"),
    row("not-object", "correction.create", "[]"),
  ]);

  assert.deepEqual(prepared.operations, [
    {
      opId: "valid-1",
      kind: "measurement.create",
      payload: { value: "5.2" },
    },
  ]);
  assert.equal(prepared.deferred, 0);
  assert.equal(prepared.batchBytes > 0, true);
  assert.deepEqual(
    prepared.actions.map((action) => ({ type: action.type, opId: action.opId })),
    [
      { type: "quarantine", opId: "bad-json" },
      { type: "quarantine", opId: "not-object" },
    ],
  );
});

test("tampered operation IDs, kinds, oversized payloads, and malformed Unicode are quarantined", () => {
  const prepared = prepareOutbox([
    row(""),
    row(`measurement:${"x".repeat(210)}`),
    row("measurement:control-character\n"),
    row("malicious-kind", "admin.delete"),
    row("oversized-payload", "session.patch", { value: "x".repeat(250_001) }),
    row("malformed-unicode", "session.patch", JSON.stringify({ value: "\ud800" })),
  ]);

  assert.deepEqual(prepared.operations, []);
  assert.equal(prepared.actions.length, 6);
  assert.equal(prepared.actions.every((action) => action.type === "quarantine"), true);
  assert.match(prepared.actions[0].type === "quarantine" ? prepared.actions[0].reason : "", /operation ID/);
  assert.match(prepared.actions[3].type === "quarantine" ? prepared.actions[3].reason : "", /kind is not supported/);
  assert.match(prepared.actions[4].type === "quarantine" ? prepared.actions[4].reason : "", /250 KB/);
});

test("batch construction enforces aggregate byte and operation-count budgets without reordering", () => {
  const byCount = prepareOutbox(
    Array.from({ length: MAX_OFFLINE_BATCH_OPERATIONS + 5 }, (_, index) =>
      row(`count-${index}`, "measurement.create", { index }),
    ),
  );
  assert.equal(byCount.operations.length, MAX_OFFLINE_BATCH_OPERATIONS);
  assert.equal(byCount.deferred, 5);
  assert.deepEqual(
    byCount.operations.map((operation) => operation.opId),
    Array.from({ length: MAX_OFFLINE_BATCH_OPERATIONS }, (_, index) => `count-${index}`),
  );

  const payload = "x".repeat(200_000);
  const byBytes = prepareOutbox(
    Array.from({ length: 20 }, (_, index) => row(`bytes-${index}`, "session.patch", { payload })),
  );
  assert.equal(byBytes.batchBytes <= MAX_OFFLINE_BATCH_BYTES, true);
  assert.equal(byBytes.operations.length < 20, true);
  assert.equal(byBytes.deferred, 20 - byBytes.operations.length);
  assert.deepEqual(
    byBytes.operations.map((operation) => operation.opId),
    Array.from({ length: byBytes.operations.length }, (_, index) => `bytes-${index}`),
  );
});

test("invalid rows after the batch closes are still quarantined", () => {
  const payload = "x".repeat(200_000);
  const rows = Array.from({ length: 20 }, (_, index) =>
    row(`bytes-${index}`, "session.patch", { payload }),
  );
  rows.push(row("bad-after-limit", "admin.delete"));
  const prepared = prepareOutbox(rows);
  assert.equal(prepared.deferred > 0, true);
  assert.deepEqual(
    prepared.actions.map((action) => action.opId),
    ["bad-after-limit"],
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

test("only literal boolean true can delete queued work", () => {
  const submitted = [
    { opId: "truthy", kind: "measurement.create", payload: {} },
    { opId: "missing-ok", kind: "session.patch", payload: {} },
    { opId: "negative-conflict", kind: "correction.create", payload: {} },
  ];
  assert.deepEqual(
    reconcileOutbox(submitted, [
      { opId: "truthy", ok: "yes" },
      { opId: "missing-ok" },
      { opId: "negative-conflict", ok: false, conflict: { currentVersion: -1 } },
    ]),
    [
      { type: "fail", opId: "truthy", error: "server returned a malformed acknowledgement" },
      { type: "fail", opId: "missing-ok", error: "server returned a malformed acknowledgement" },
      { type: "fail", opId: "negative-conflict", error: "unknown server error" },
    ],
  );
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
    () => reconcileOutbox([], undefined),
    /did not contain a results array/,
  );
});
