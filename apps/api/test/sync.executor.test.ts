// Phase 5a PR 1 — sync executor unit tests.
// Pure logic: tiny fake tx records calls + extracts entityId from sql-template
// params. Ponytail: the fake mirrors Drizzle's tx interface (insert returns a
// values-builder with .execute(); execute() returns { rows: [...] }). Swapping
// to a real integration test is a one-liner.

import { test } from "node:test";
import assert from "node:assert/strict";

import { applyOps } from "../src/sync/executor.js";

const CUST_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const INV_ID = "33333333-3333-4333-8333-333333333333";

interface RecordedCall {
  kind: "insert" | "update" | "delete";
  table?: unknown;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
}

function buildFakeDb(currentVersion: Map<string, number> = new Map()) {
  const calls: RecordedCall[] = [];

  // Reads entityId (the last string in `params`, skipping any sql.identifier
  // placeholders which drizzle emits without a value). The executor's only
  // execute()-call is the version-check query:
  //   SELECT version FROM <table> WHERE id = <entityId> LIMIT 1
  const fakeExecute = async (sqlFragment: unknown) => {
    const chunks = (sqlFragment as { queryChunks?: unknown[] })?.queryChunks ?? [];
    // walk chunks for the rightmost UUID-looking string (entityId)
    let entityId: string | undefined;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const raw = chunks[i];
      const v =
        typeof raw === "string"
          ? raw
          : typeof raw === "object" && raw !== null
            ? (raw as { value?: unknown }).value
            : undefined;
      if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) {
        entityId = v;
        break;
      }
    }
    if (!entityId) return { rows: [] };
    for (const [id, version] of currentVersion.entries()) {
      if (id === entityId) return { rows: [{ version }] };
    }
    return { rows: [] };
  };

  // ponytail: chained builders expose `.returning()` after `.where()` so the
  // executor's race-detect reads the affected row count. The fake emulates
  // `returning({ v: table.version })` returning a 1-row array, mirroring
  // Drizzle's real behavior under the BEFORE UPDATE trigger.
  const tx: any = {
    insert: (_t: unknown) => {
      calls.push({ kind: "insert" });
      return {
        values: (v: Record<string, unknown>) => {
          const last = calls[calls.length - 1];
          if (last) last.values = v;
          return { execute: async () => undefined };
        },
      };
    },
    update: (_t: unknown) => {
      calls.push({ kind: "update" });
      return {
        set: (s: Record<string, unknown>) => {
          const last = calls[calls.length - 1];
          if (last) last.set = s;
          return makeChainWithReturning();
        },
      };
    },
    delete: (_t: unknown) => {
      calls.push({ kind: "delete" });
      return { where: () => makeChainWithReturning() };
    },
    execute: fakeExecute,
  };
  const db: any = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  };
  return { db, calls };
}

// builder returned by .where() in update/delete — supports both .execute()
// and .returning(). The fake returns a fresh version so the executor's
// row-affected check sees a 1-row result.
function makeChainWithReturning(): any {
  const chain: any = {};
  chain.execute = async () => undefined;
  chain.where = () => chain;
  chain.returning = async () => [{ v: 0 }]; // bumped version after trigger
  return chain;
}

test("applyOps: empty batch returns empty results", async () => {
  const { db } = buildFakeDb();
  const results = await applyOps(db, "org1", []);
  assert.deepEqual(results, []);
});

test("applyOps: create routes to insert with id+orgId stamped", async () => {
  const { db, calls } = buildFakeDb();
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "create",
      table: "jobs",
      entityId: JOB_ID,
      payload: { customerId: CUST_ID, title: "Fix sink" },
    },
  ]);
  assert.equal(results[0].opId, "o1");
  assert.equal(results[0].ok, true);
  const ins = calls.find((c) => c.kind === "insert");
  assert.ok(ins, "expected insert");
  assert.equal(ins!.values!.id, JOB_ID);
  assert.equal(ins!.values!.orgId, "org-7");
  assert.equal(ins!.values!.title, "Fix sink");
  assert.equal(ins!.values!.customerId, CUST_ID);
});

test("applyOps: create with bad payload returns ok:false with parse error", async () => {
  const { db } = buildFakeDb();
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "create",
      table: "jobs",
      entityId: JOB_ID,
      // missing required `title` and `customerId`
      payload: { description: "nope" },
    },
  ]);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error?.kind, "validation");
  assert.match(results[0].error?.message ?? "", /payload parse/);
});

test("applyOps: unknown table returns 'unknown table' per-op", async () => {
  const { db } = buildFakeDb();
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "create",
      table: "wigglements" as never,
      entityId: JOB_ID,
      payload: {},
    },
  ]);    assert.equal(results[0].ok, false);
    assert.equal(results[0].error?.kind, "validation");
    assert.match(results[0].error?.message ?? "", /unknown table/);
  });

test("applyOps: update without baseVersion returns error", async () => {
  const versions = new Map([[JOB_ID, 3]]);
  const { db } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "update",
      table: "jobs",
      entityId: JOB_ID,
      payload: { customerId: CUST_ID, title: "Renamed" },
    },
  ]);    assert.equal(results[0].ok, false);
    assert.equal(results[0].error?.kind, "validation");
    assert.match(results[0].error?.message ?? "", /baseVersion/);
  });

test("applyOps: update on missing row returns 'not found'", async () => {
  const { db } = buildFakeDb(new Map()); // empty database
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "update",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 1,
      payload: { customerId: CUST_ID, title: "x" },
    },
  ]);    assert.equal(results[0].ok, false);
    assert.equal(results[0].error?.kind, "validation");
    assert.match(results[0].error?.message ?? "", /not found/);
  });

test("applyOps: stale baseVersion returns conflict with currentVersion", async () => {
  const versions = new Map([[JOB_ID, 5]]);
  const { db } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "update",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 3,
      payload: { customerId: CUST_ID, title: "Renamed" },
    },
  ]);
  assert.equal(results[0].ok, false);
  assert.deepEqual(results[0].conflict, { currentVersion: 5 });
});

test("applyOps: matching baseVersion writes update with version predicate", async () => {
  const versions = new Map([[JOB_ID, 3]]);
  const { db, calls } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "update",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 3,
      payload: { customerId: CUST_ID, title: "Renamed" },
    },
  ]);
  assert.equal(results[0].ok, true);
  const upd = calls.find((c) => c.kind === "update" && c.set);
  assert.ok(upd, "expected update with .set payload");
  assert.equal(upd!.set!.title, "Renamed");
});

test("applyOps: update with bad payload (after passing version check) returns parse error", async () => {
  const versions = new Map([[JOB_ID, 1]]);
  const { db } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "update",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 1,
      // missing required customerId — must surface AFTER version check
      payload: { title: "Renamed" },
    },
  ]);    assert.equal(results[0].ok, false);
    assert.equal(results[0].error?.kind, "validation");
    assert.match(results[0].error?.message ?? "", /payload parse/);
    assert.equal(results[0].conflict, undefined);
  });

test("applyOps: delete without baseVersion returns error", async () => {
  const versions = new Map([[JOB_ID, 2]]);
  const { db } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "delete",
      table: "jobs",
      entityId: JOB_ID,
      payload: {},
    },
  ]);    assert.equal(results[0].ok, false);
    assert.equal(results[0].error?.kind, "validation");
    assert.match(results[0].error?.message ?? "", /baseVersion/);
  });

test("applyOps: delete with matching baseVersion routes to delete", async () => {
  const versions = new Map([[JOB_ID, 2]]);
  const { db, calls } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "delete",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 2,
      payload: {},
    },
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(calls.filter((c) => c.kind === "delete").length, 1);
});

test("applyOps: delete with stale baseVersion returns conflict", async () => {
  const versions = new Map([[JOB_ID, 7]]);
  const { db } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "delete",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 1,
      payload: {},
    },
  ]);
  assert.equal(results[0].ok, false);
  assert.deepEqual(results[0].conflict, { currentVersion: 7 });
});

test("applyOps: one bad op does not poison sibling ops", async () => {
  const versions = new Map([[JOB_ID, 1]]);
  const missingId = "99999999-9999-4999-8999-999999999999";
  const { db, calls } = buildFakeDb(versions);
  const results = await applyOps(db, "org-7", [
    {
      opId: "good",
      type: "update",
      table: "jobs",
      entityId: JOB_ID,
      baseVersion: 1,
      payload: { customerId: CUST_ID, title: "Renamed" },
    },
    {
      opId: "bad",
      type: "update",
      table: "jobs",
      entityId: missingId,
      baseVersion: 1,
      payload: { customerId: CUST_ID, title: "x" },
    },
  ]);
  assert.equal(results.find((r) => r.opId === "good")?.ok, true);
  assert.equal(results.find((r) => r.opId === "bad")?.ok, false);
  assert.equal(results.find((r) => r.opId === "bad")?.error?.kind, "validation");
  assert.match(results.find((r) => r.opId === "bad")?.error?.message ?? "", /not found/);
  // the good op produced a real update; the bad op produced a select-then-fail
  assert.equal(calls.filter((c) => c.kind === "update" && c.set).length, 1);
});

test("applyOps: unknown op.type returns error", async () => {
  const { db } = buildFakeDb();
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "frobnicate" as never,
      table: "jobs",
      entityId: JOB_ID,
      payload: {},
    },
  ]);    assert.equal(results[0].ok, false);
    assert.equal(results[0].error?.kind, "validation");
    assert.match(results[0].error?.message ?? "", /(unknown op\.type|unknown table)/);
  });

test("applyOps: invoice table routes correctly", async () => {
  const { db, calls } = buildFakeDb();
  const results = await applyOps(db, "org-7", [
    {
      opId: "o1",
      type: "create",
      table: "invoices",
      entityId: INV_ID,
      payload: { jobId: JOB_ID, number: "INV-001", total: 12500 },
    },
  ]);
  assert.equal(results[0].ok, true);
  const ins = calls.find((c) => c.kind === "insert");
  assert.ok(ins);
  assert.equal(ins!.values!.number, "INV-001");
  assert.equal(ins!.values!.total, 12500);
});
