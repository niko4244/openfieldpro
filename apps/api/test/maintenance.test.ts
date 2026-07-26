import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileMaintenanceReader,
  WorkerDrainTracker,
  isMaintenanceExempt,
  isMutatingMethod,
} from "../src/maintenance.js";
import type { OperationsClient } from "../src/operations-client.js";
import { buildServer } from "../src/server.js";

const passingProbes = {
  postgres: async () => {},
  uploads: async () => {},
  migrations: async () => {},
};

test("maintenance classifies every non-read HTTP method as mutating", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(isMutatingMethod(method), false, method);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "CONNECT", "TRACE", "CUSTOM"]) {
    assert.equal(isMutatingMethod(method), true, method);
  }
});

test("maintenance exemptions are an exact fixed recovery allowlist", () => {
  assert.equal(isMaintenanceExempt("POST", "/api/auth/login"), true);
  assert.equal(isMaintenanceExempt("POST", "/api/operations/maintenance/exit"), true);
  assert.equal(isMaintenanceExempt("POST", "/api/operations/maintenance/exit/extra"), false);
  assert.equal(isMaintenanceExempt("PUT", "/api/operations/maintenance/exit"), false);
  assert.equal(isMaintenanceExempt("POST", "/api/operations/backups"), false);
});

test("configured maintenance state fails closed when missing or malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "ofp-maintenance-"));
  try {
    const path = join(directory, "maintenance.json");
    const reader = new FileMaintenanceReader(path);
    assert.equal(reader.read().active, true);

    writeFileSync(path, "{not-json");
    assert.equal(reader.read().active, true);

    writeFileSync(path, JSON.stringify({ version: 1, active: false }));
    assert.equal(reader.read().active, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("maintenance blocks writes but keeps reads, liveness, owner status, and recovery available", async () => {
  let backupCalls = 0;
  let exitCalls = 0;
  const operationsClient = {
    status: async () => ({ contractVersion: "v1", status: "ready", maintenance: true }),
    backup: async () => {
      backupCalls++;
      throw new Error("blocked request reached controller");
    },
    maintenanceExit: async () => {
      exitCalls++;
      return {
        id: "f2764df8-f107-4a3e-8043-a497c06b52cc",
        kind: "maintenance_exit",
        state: "succeeded",
        requestedAt: "2026-07-25T12:00:00.000Z",
        completedAt: "2026-07-25T12:00:01.000Z",
      };
    },
  } as OperationsClient;
  const app = buildServer({
    healthProbes: passingProbes,
    operationsClient,
    maintenanceReader: { read: () => ({ active: true }) },
  });
  await app.ready();
  const ownerToken = app.jwt.sign({ userId: "owner", orgId: "org", role: "owner" });
  const auth = { authorization: `Bearer ${ownerToken}` };

  const live = await app.inject({ method: "GET", url: "/api/health/live" });
  const read = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: auth,
  });
  const status = await app.inject({
    method: "GET",
    url: "/api/operations/status",
    headers: auth,
  });
  const blocked = await app.inject({
    method: "POST",
    url: "/api/operations/backups",
    headers: { ...auth, "idempotency-key": "maintenance-backup-1" },
    payload: {},
  });
  const recovery = await app.inject({
    method: "POST",
    url: "/api/operations/maintenance/exit",
    headers: { ...auth, "idempotency-key": "maintenance-exit-1" },
    payload: {},
  });

  assert.equal(live.statusCode, 200);
  assert.equal(read.statusCode, 200);
  assert.equal(status.statusCode, 200);
  assert.equal(blocked.statusCode, 503);
  assert.equal(blocked.headers["retry-after"], "30");
  assert.deepEqual(blocked.json(), {
    error: "OpenFieldPro is temporarily in maintenance mode. Please try again shortly.",
    retryable: true,
  });
  assert.equal(recovery.statusCode, 202);
  assert.equal(backupCalls, 0);
  assert.equal(exitCalls, 1);
  await app.close();
});

test("worker drain tracking stops new claims and reports drained after active work finishes", () => {
  let active = false;
  const tracker = new WorkerDrainTracker({ read: () => ({ active }) });
  const finish = tracker.begin();
  assert.ok(finish);
  assert.deepEqual(tracker.status(), { activeJobs: 1, drained: false, maintenance: false });

  active = true;
  assert.equal(tracker.begin(), undefined);
  assert.deepEqual(tracker.status(), { activeJobs: 1, drained: false, maintenance: true });

  finish();
  finish();
  assert.deepEqual(tracker.status(), { activeJobs: 0, drained: true, maintenance: true });
});

test("API drain status waits for a mutation that passed the gate before maintenance", async () => {
  let maintenance = false;
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operationsClient = {
    backup: async () => {
      started();
      await blocked;
      return {
        id: "f2764df8-f107-4a3e-8043-a497c06b52cc",
        kind: "backup",
        state: "queued",
        requestedAt: "2026-07-25T12:00:00.000Z",
      };
    },
  } as OperationsClient;
  const app = buildServer({
    healthProbes: passingProbes,
    operationsClient,
    maintenanceReader: { read: () => ({ active: maintenance }) },
  });
  await app.ready();
  const token = app.jwt.sign({ userId: "owner", orgId: "org", role: "owner" });
  const request = app.inject({
    method: "POST",
    url: "/api/operations/backups",
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": "in-flight-backup-1",
    },
    payload: {},
  });
  await entered;

  maintenance = true;
  assert.deepEqual(
    (await app.inject({ method: "GET", url: "/internal/drain" })).json(),
    { activeJobs: 1, drained: false, maintenance: true },
  );

  release();
  assert.equal((await request).statusCode, 202);
  assert.deepEqual(
    (await app.inject({ method: "GET", url: "/internal/drain" })).json(),
    { activeJobs: 0, drained: true, maintenance: true },
  );
  await app.close();
});
