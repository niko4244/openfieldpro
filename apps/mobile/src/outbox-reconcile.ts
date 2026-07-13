export const ALLOWED_OFFLINE_OPERATION_KINDS = new Set([
  "measurement.create",
  "session.patch",
  "correction.create",
]);

export interface StoredOutboxRow {
  op_id: string;
  kind: string;
  payload_json: string;
  attempts: number;
}

export interface PreparedOfflineOperation {
  opId: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface OfflineBatchResult {
  opId: string;
  ok: boolean;
  conflict?: { currentVersion: number };
  error?: string;
}

export type OutboxAction =
  | { type: "delete"; opId: string }
  | { type: "fail"; opId: string; error: string }
  | { type: "quarantine"; opId: string; reason: string; payloadJson: string };

function boundedError(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500) || "unknown error";
}

function validateStoredRow(row: StoredOutboxRow) {
  if (!row.op_id || row.op_id.length > 200 || /[\u0000-\u001f\u007f]/.test(row.op_id)) {
    throw new Error("operation ID is empty, oversized, or contains control characters");
  }
  if (!ALLOWED_OFFLINE_OPERATION_KINDS.has(row.kind)) {
    throw new Error("operation kind is not supported by this application version");
  }
  if (row.payload_json.length > 1_000_000) {
    throw new Error("operation payload exceeds the 1 MB offline replay limit");
  }
}

export function prepareOutbox(rows: StoredOutboxRow[]) {
  const operations: PreparedOfflineOperation[] = [];
  const actions: OutboxAction[] = [];

  for (const row of rows) {
    try {
      validateStoredRow(row);
      const payload = JSON.parse(row.payload_json) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("payload must be a JSON object");
      }
      operations.push({
        opId: row.op_id,
        kind: row.kind,
        payload: payload as Record<string, unknown>,
      });
    } catch (error) {
      actions.push({
        type: "quarantine",
        opId: row.op_id,
        reason: boundedError(error instanceof Error ? error.message : String(error)),
        payloadJson: row.payload_json,
      });
    }
  }

  return { operations, actions };
}

export function reconcileOutbox(
  submitted: PreparedOfflineOperation[],
  results: OfflineBatchResult[],
): OutboxAction[] {
  if (!Array.isArray(results)) throw new Error("Offline batch response did not contain a results array.");

  const knownIds = new Set(submitted.map((operation) => operation.opId));
  const resultById = new Map<string, OfflineBatchResult>();
  for (const result of results) {
    if (!result || typeof result.opId !== "string" || !knownIds.has(result.opId)) continue;
    if (!resultById.has(result.opId)) resultById.set(result.opId, result);
  }

  return submitted.map((operation): OutboxAction => {
    const result = resultById.get(operation.opId);
    if (!result) {
      return {
        type: "fail",
        opId: operation.opId,
        error: "server did not acknowledge this operation",
      };
    }
    if (result.ok) return { type: "delete", opId: operation.opId };
    if (result.conflict && Number.isFinite(result.conflict.currentVersion)) {
      return {
        type: "fail",
        opId: operation.opId,
        error: `conflict: server version ${result.conflict.currentVersion}`,
      };
    }
    return {
      type: "fail",
      opId: operation.opId,
      error: boundedError(typeof result.error === "string" ? result.error : "unknown server error"),
    };
  });
}
