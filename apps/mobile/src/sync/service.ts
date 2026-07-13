import * as SQLite from "expo-sqlite";
import {
  NativeRequestError,
  nativeRequest,
  scopedDatabaseName,
  type NativeSession,
} from "../auth";
import {
  STORAGE_SCHEMA_VERSION,
  storageIdentityDecision,
  type StoredStorageIdentity,
} from "../storage-identity";

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

export interface FieldPackage {
  packageVersion: number;
  generatedAt: string;
  job: Record<string, unknown>;
  equipment: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  workflow: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  measurements: Array<Record<string, unknown>>;
  supportState: string;
  downloadReady: boolean;
}

export interface FieldSyncResult {
  downloaded: number;
  queuedBeforeFlush: number;
  flushed: number;
  failed: number;
  cachedJobs: string[];
}

interface OutboxRow {
  op_id: string;
  kind: OfflineOpKind;
  payload_json: string;
  attempts: number;
}

interface PackageRow {
  payload_json: string;
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
      CREATE TABLE IF NOT EXISTS diagnostic_outbox (
        op_id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
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

  async downloadPackage(jobId: string): Promise<FieldPackage> {
    const fieldPackage = await nativeRequest<FieldPackage>(
      this.opts.apiUrl,
      this.session(),
      `/api/diagnostics/field-package/${encodeURIComponent(jobId)}`,
    );
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
      JSON.stringify(fieldPackage),
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
      "SELECT payload_json FROM field_packages WHERE job_id = ? LIMIT 1",
      jobId,
    );
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as FieldPackage;
    } catch {
      return null;
    }
  }

  async listCachedPackages(): Promise<FieldPackage[]> {
    const database = await this.database();
    const rows = await database.getAllAsync<PackageRow>(
      "SELECT payload_json FROM field_packages ORDER BY cached_at DESC",
    );
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload_json) as FieldPackage];
      } catch {
        return [];
      }
    });
  }

  async queuedCount(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM diagnostic_outbox",
    );
    return row?.count ?? 0;
  }

  async queueOperation(operation: OfflineOperation): Promise<void> {
    const database = await this.database();
    await database.runAsync(
      `INSERT OR REPLACE INTO diagnostic_outbox
        (op_id, kind, payload_json, attempts, last_error, created_at)
       VALUES (?, ?, ?, 0, NULL, ?)`,
      operation.opId,
      operation.kind,
      JSON.stringify(operation.payload),
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

  async flushOutbox(): Promise<{ flushed: number; failed: number }> {
    const database = await this.database();
    const rows = await database.getAllAsync<OutboxRow>(
      "SELECT op_id, kind, payload_json, attempts FROM diagnostic_outbox ORDER BY created_at ASC LIMIT 200",
    );
    if (rows.length === 0) return { flushed: 0, failed: 0 };

    const operations = rows.flatMap((row) => {
      try {
        return [
          {
            opId: row.op_id,
            kind: row.kind,
            payload: JSON.parse(row.payload_json) as Record<string, unknown>,
          },
        ];
      } catch {
        return [];
      }
    });

    const body = await nativeRequest<{
      results: Array<{
        opId: string;
        ok: boolean;
        conflict?: { currentVersion: number };
        error?: string;
      }>;
    }>(this.opts.apiUrl, this.session(), "/api/diagnostics/offline-batch", {
      method: "POST",
      body: JSON.stringify({ ops: operations }),
    });

    let flushed = 0;
    let failed = 0;
    await database.withExclusiveTransactionAsync(async () => {
      for (const result of body.results) {
        if (result.ok) {
          await database.runAsync(
            "DELETE FROM diagnostic_outbox WHERE op_id = ?",
            result.opId,
          );
          flushed += 1;
        } else {
          await database.runAsync(
            `UPDATE diagnostic_outbox
             SET attempts = attempts + 1, last_error = ?
             WHERE op_id = ?`,
            result.conflict
              ? `conflict: server version ${result.conflict.currentVersion}`
              : result.error ?? "unknown error",
            result.opId,
          );
          failed += 1;
        }
      }
    });

    return { flushed, failed };
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
