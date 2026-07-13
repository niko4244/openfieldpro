import * as SQLite from "expo-sqlite";
import {
  NativeRequestError,
  nativeRequest,
  scopedDatabaseName,
  type NativeSession,
} from "../auth";
import {
  validateFieldPackage,
  type FieldPackage,
} from "../field-package";
import {
  prepareOutbox,
  reconcileOutbox,
  serializeOfflineOperation,
  type OutboxAction,
  type StoredOutboxRow,
} from "../outbox-reconcile";
import {
  STORAGE_SCHEMA_VERSION,
  storageIdentityDecision,
  type StoredStorageIdentity,
} from "../storage-identity";

export type { FieldPackage } from "../field-package";

export interface SyncServiceOptions extends NativeSession {
  apiUrl: string;
}

export type OfflineOpKind =
  | "measurement.create"
  | "session.patch"
  | "correction.create";

export interface OfflineOperation {
  opId: string;
  kind: OfflineOpKind;
  payload: Record<string, unknown>;
}

export interface FieldSyncResult {
  downloaded: number;
  queuedBeforeFlush: number;
  flushed: number;
  failed: number;
  cachedJobs: string[];
}

interface PackageRow {
  job_id: string;
  payload_json: string;
}

function boundedLocalReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500) || "invalid offline data";
}

function makeId(): string {
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export class SyncService {
  private databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
  private closed = false;

  constructor(private opts: SyncServiceOptions) {}

  private session(): NativeSession {
    return {
      token: this.opts.token,
      orgId: this.opts.orgId,
      user: this.opts.user,
    };
  }

  private async initializeDatabase(database: SQLite.SQLiteDatabase) {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS storage_identity (
        singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS field_packages (
        job_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        workflow_version TEXT,
        support_state TEXT NOT NULL,
        download_ready INTEGER NOT NULL DEFAULT 0,
        cached_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS field_package_dead_letter (
        job_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        quarantined_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS diagnostic_outbox (
        op_id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS diagnostic_dead_letter (
        op_id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        quarantined_at TEXT NOT NULL
      );
    `);

    await database.withExclusiveTransactionAsync(async () => {
      const identity = await database.getFirstAsync<StoredStorageIdentity>(
        "SELECT org_id, user_id, schema_version FROM storage_identity WHERE singleton = 1 LIMIT 1",
      );
      const decision = storageIdentityDecision(identity, {
        orgId: this.opts.orgId,
        userId: this.opts.user.id,
      });
      if (decision === "initialize") {
        await database.runAsync(
          `INSERT INTO storage_identity (singleton, org_id, user_id, schema_version)
           VALUES (1, ?, ?, ?)`,
          this.opts.orgId,
          this.opts.user.id,
          STORAGE_SCHEMA_VERSION,
        );
      }
    });
  }

  private async database(): Promise<SQLite.SQLiteDatabase> {
    if (this.closed) throw new Error("Offline storage is closed for this signed-out session.");
    if (!this.databasePromise) {
      const databaseName = scopedDatabaseName(this.opts.orgId, this.opts.user.id);
      this.databasePromise = SQLite.openDatabaseAsync(databaseName).then(async (database) => {
        try {
          await this.initializeDatabase(database);
          if (this.closed) {
            await database.closeAsync();
            throw new Error("Offline storage closed while it was initializing.");
          }
          return database;
        } catch (error) {
          await database.closeAsync().catch(() => undefined);
          throw error;
        }
      });
    }
    return this.databasePromise;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const pendingDatabase = this.databasePromise;
    this.databasePromise = null;
    if (!pendingDatabase) return;
    const database = await pendingDatabase.catch(() => null);
    await database?.closeAsync().catch(() => undefined);
  }

  private async quarantineFieldPackage(
    database: SQLite.SQLiteDatabase,
    row: PackageRow,
    error: unknown,
  ) {
    await database.withExclusiveTransactionAsync(async () => {
      await database.runAsync(
        `INSERT OR REPLACE INTO field_package_dead_letter
          (job_id, payload_json, reason, quarantined_at)
         VALUES (?, ?, ?, ?)`,
        row.job_id,
        row.payload_json,
        boundedLocalReason(error),
        new Date().toISOString(),
      );
      await database.runAsync("DELETE FROM field_packages WHERE job_id = ?", row.job_id);
    });
  }

  private validateStoredPackage(row: PackageRow) {
    const parsed = JSON.parse(row.payload_json) as unknown;
    return validateFieldPackage(parsed, {
      orgId: this.opts.orgId,
      jobId: row.job_id,
    }).fieldPackage;
  }

  async downloadPackage(jobId: string): Promise<FieldPackage> {
    const response = await nativeRequest<unknown>(
      this.opts.apiUrl,
      this.session(),
      `/api/diagnostics/field-package/${encodeURIComponent(jobId)}`,
    );
    const { fieldPackage, serialized } = validateFieldPackage(response, {
      orgId: this.opts.orgId,
      jobId,
    });
    const database = await this.database();
    const workflowVersion =
      fieldPackage.session && typeof fieldPackage.session.workflowVersion === "number"
        ? String(fieldPackage.session.workflowVersion)
        : null;

    await database.runAsync(
      `INSERT OR REPLACE INTO field_packages
        (job_id, payload_json, workflow_version, support_state, download_ready, cached_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      jobId,
      serialized,
      workflowVersion,
      fieldPackage.supportState,
      fieldPackage.downloadReady ? 1 : 0,
      new Date().toISOString(),
    );
    return fieldPackage;
  }

  async getCachedPackage(jobId: string): Promise<FieldPackage | null> {
    const database = await this.database();
    const row = await database.getFirstAsync<PackageRow>(
      "SELECT job_id, payload_json FROM field_packages WHERE job_id = ? LIMIT 1",
      jobId,
    );
    if (!row) return null;
    try {
      return this.validateStoredPackage(row);
    } catch (error) {
      await this.quarantineFieldPackage(database, row, error);
      return null;
    }
  }

  async listCachedPackages(): Promise<FieldPackage[]> {
    const database = await this.database();
    const rows = await database.getAllAsync<PackageRow>(
      "SELECT job_id, payload_json FROM field_packages ORDER BY cached_at DESC",
    );
    const valid: FieldPackage[] = [];
    for (const row of rows) {
      try {
        valid.push(this.validateStoredPackage(row));
      } catch (error) {
        await this.quarantineFieldPackage(database, row, error);
      }
    }
    return valid;
  }

  async queuedCount(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM diagnostic_outbox",
    );
    return row?.count ?? 0;
  }

  async queueOperation(operation: OfflineOperation): Promise<void> {
    const payloadJson = serializeOfflineOperation(operation);
    const database = await this.database();
    await database.runAsync(
      `INSERT OR REPLACE INTO diagnostic_outbox
        (op_id, kind, payload_json, attempts, last_error, created_at)
       VALUES (?, ?, ?, 0, NULL, ?)`,
      operation.opId,
      operation.kind,
      payloadJson,
      new Date().toISOString(),
    );
  }

  async queueMeasurement(input: {
    sessionId: string;
    stepId: string;
    valueText?: string;
    unit?: string;
    result: "pass" | "fail" | "within_range" | "out_of_range" | "unable" | "not_reproduced";
    note?: string;
    unableReason?: string;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `measurement:${id}`,
      kind: "measurement.create",
      payload: { id, ...input, recordedAt: new Date().toISOString() },
    });
    return id;
  }

  async queueSessionPatch(input: {
    sessionId: string;
    baseVersion: number;
    status?: string;
    customerComplaint?: string | null;
    technicianObservation?: string | null;
    errorCodes?: string[];
    serviceTests?: Array<{ name: string; result?: string; note?: string }>;
    disposition?: string | null;
    summary?: string | null;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `session:${id}`,
      kind: "session.patch",
      payload: input,
    });
    return id;
  }

  async queueCorrection(input: {
    workflowId: string;
    workflowVersion: number;
    sessionId?: string;
    stepId?: string;
    category: string;
    severity: "low" | "medium" | "high" | "safety_critical";
    description: string;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `correction:${id}`,
      kind: "correction.create",
      payload: { id, ...input },
    });
    return id;
  }

  private async applyOutboxActions(
    database: SQLite.SQLiteDatabase,
    rows: StoredOutboxRow[],
    actions: OutboxAction[],
  ) {
    const rowsById = new Map(rows.map((row) => [row.op_id, row]));
    for (const action of actions) {
      if (action.type === "delete") {
        await database.runAsync("DELETE FROM diagnostic_outbox WHERE op_id = ?", action.opId);
        continue;
      }
      if (action.type === "fail") {
        await database.runAsync(
          `UPDATE diagnostic_outbox
           SET attempts = attempts + 1, last_error = ?
           WHERE op_id = ?`,
          action.error,
          action.opId,
        );
        continue;
      }

      const row = rowsById.get(action.opId);
      if (!row) continue;
      await database.runAsync(
        `INSERT OR REPLACE INTO diagnostic_dead_letter
          (op_id, kind, payload_json, reason, quarantined_at)
         VALUES (?, ?, ?, ?, ?)`,
        row.op_id,
        row.kind,
        action.payloadJson,
        action.reason,
        new Date().toISOString(),
      );
      await database.runAsync("DELETE FROM diagnostic_outbox WHERE op_id = ?", row.op_id);
    }
  }

  async flushOutbox(): Promise<{ flushed: number; failed: number }> {
    const database = await this.database();
    const rows = await database.getAllAsync<StoredOutboxRow>(
      "SELECT op_id, kind, payload_json, attempts FROM diagnostic_outbox ORDER BY created_at ASC LIMIT 200",
    );
    if (rows.length === 0) return { flushed: 0, failed: 0 };

    const prepared = prepareOutbox(rows);
    if (prepared.actions.length > 0) {
      await database.withExclusiveTransactionAsync(async () => {
        await this.applyOutboxActions(database, rows, prepared.actions);
      });
    }
    if (prepared.operations.length === 0) {
      return { flushed: 0, failed: prepared.actions.length };
    }

    const body = await nativeRequest<{ results?: unknown }>(
      this.opts.apiUrl,
      this.session(),
      "/api/diagnostics/offline-batch",
      {
        method: "POST",
        body: JSON.stringify({ ops: prepared.operations }),
      },
    );
    const reconciliation = reconcileOutbox(prepared.operations, body?.results);

    await database.withExclusiveTransactionAsync(async () => {
      await this.applyOutboxActions(database, rows, reconciliation);
    });

    return {
      flushed: reconciliation.filter((action) => action.type === "delete").length,
      failed:
        prepared.actions.length +
        reconciliation.filter((action) => action.type === "fail").length,
    };
  }

  /** Synchronize coherent job/appliance/diagnostic packages for this user only. */
  async pull(): Promise<FieldSyncResult> {
    const queuedBeforeFlush = await this.queuedCount();
    let flush = { flushed: 0, failed: queuedBeforeFlush };
    try {
      flush = await this.flushOutbox();
    } catch (error) {
      if (error instanceof NativeRequestError && error.terminalAuthenticationFailure) throw error;
    }

    const [appointments, sessions] = await Promise.all([
      nativeRequest<Array<{ jobId: string; startsAt: string; endsAt: string }>>(
        this.opts.apiUrl,
        this.session(),
        "/api/appointments",
      ),
      nativeRequest<Array<{ session: { jobId: string; status: string } }>>(
        this.opts.apiUrl,
        this.session(),
        "/api/diagnostics/sessions",
      ).catch((error) => {
        if (error instanceof NativeRequestError && error.terminalAuthenticationFailure) throw error;
        return [];
      }),
    ]);

    const now = Date.now();
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    const jobIds = new Set<string>();
    for (const appointment of appointments) {
      const starts = new Date(appointment.startsAt).getTime();
      const ends = new Date(appointment.endsAt).getTime();
      if (starts <= horizon && ends >= now - 24 * 60 * 60 * 1000) jobIds.add(appointment.jobId);
    }
    for (const item of sessions) {
      if (!["completed", "inconclusive"].includes(item.session.status)) {
        jobIds.add(item.session.jobId);
      }
    }

    let downloaded = 0;
    let failed = flush.failed;
    for (const jobId of jobIds) {
      try {
        await this.downloadPackage(jobId);
        downloaded += 1;
      } catch (error) {
        if (error instanceof NativeRequestError && error.terminalAuthenticationFailure) throw error;
        failed += 1;
      }
    }

    return {
      downloaded,
      queuedBeforeFlush,
      flushed: flush.flushed,
      failed,
      cachedJobs: [...jobIds],
    };
  }
}
