export const ALLOWED_OFFLINE_OPERATION_KINDS = new Set([
  "measurement.create",
  "session.patch",
  "correction.create",
]);

export const MAX_OFFLINE_OPERATION_BYTES = 250_000;
export const MAX_OFFLINE_BATCH_BYTES = 2_000_000;
export const MAX_OFFLINE_BATCH_OPERATIONS = 50;
const MAX_OFFLINE_JSON_DEPTH = 32;
const MAX_OFFLINE_JSON_NODES = 50_000;

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

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function hasUnpairedSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function validateJsonTree(
  value: unknown,
  depth = 0,
  state: { nodes: number; seen: Set<object> } = { nodes: 0, seen: new Set() },
) {
  state.nodes += 1;
  if (state.nodes > MAX_OFFLINE_JSON_NODES) {
    throw new Error("offline operation payload contains too many JSON values");
  }
  if (depth > MAX_OFFLINE_JSON_DEPTH) {
    throw new Error("offline operation payload exceeds the maximum JSON depth");
  }

  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("offline operation payload contains a non-finite number");
    return;
  }
  if (typeof value === "string") {
    if (hasUnpairedSurrogate(value)) throw new Error("offline operation payload contains malformed Unicode");
    return;
  }
  if (typeof value !== "object") {
    throw new Error("offline operation payload contains a non-JSON value");
  }
  if (state.seen.has(value)) throw new Error("offline operation payload contains a cycle");
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) validateJsonTree(item, depth + 1, state);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (hasUnpairedSurrogate(key)) throw new Error("offline operation payload contains malformed Unicode");
      validateJsonTree(item, depth + 1, state);
    }
  } finally {
    state.seen.delete(value);
  }
}

function validateStoredRow(row: StoredOutboxRow) {
  if (!row.op_id || row.op_id.length > 200 || /[\u0000-\u001f\u007f]/.test(row.op_id)) {
    throw new Error("operation ID is empty, oversized, or contains control characters");
  }
  if (!ALLOWED_OFFLINE_OPERATION_KINDS.has(row.kind)) {
    throw new Error("operation kind is not supported by this application version");
  }
  if (utf8ByteLength(row.payload_json) > MAX_OFFLINE_OPERATION_BYTES) {
    throw new Error("operation payload exceeds the 250 KB offline replay limit");
  }
}

export function serializeOfflineOperation(operation: PreparedOfflineOperation) {
  if (!operation.payload || typeof operation.payload !== "object" || Array.isArray(operation.payload)) {
    throw new Error("offline operation payload must be a JSON object");
  }
  validateJsonTree(operation.payload);

  let payloadJson: string;
  try {
    payloadJson = JSON.stringify(operation.payload);
  } catch {
    throw new Error("offline operation payload could not be serialized");
  }
  if (!payloadJson) throw new Error("offline operation payload could not be serialized");

  validateStoredRow({
    op_id: operation.opId,
    kind: operation.kind,
    payload_json: payloadJson,
    attempts: 0,
  });
  return payloadJson;
}

function operationByteLength(operation: PreparedOfflineOperation) {
  return utf8ByteLength(JSON.stringify(operation));
}

export function prepareOutbox(rows: StoredOutboxRow[]) {
  const operations: PreparedOfflineOperation[] = [];
  const actions: OutboxAction[] = [];
  let deferred = 0;
  let batchBytes = 0;
  let batchClosed = false;

  for (const row of rows) {
    try {
      validateStoredRow(row);
      const payload = JSON.parse(row.payload_json) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("payload must be a JSON object");
      }
      validateJsonTree(payload);

      const operation = {
        opId: row.op_id,
        kind: row.kind,
        payload: payload as Record<string, unknown>,
      };
      const operationBytes = operationByteLength(operation);
      const exceedsBatch =
        operations.length >= MAX_OFFLINE_BATCH_OPERATIONS ||
        batchBytes + operationBytes > MAX_OFFLINE_BATCH_BYTES;

      // Preserve queue order: once a valid operation cannot fit, defer it and
      // all subsequent valid rows to a later batch. Invalid rows are still
      // quarantined during this scan.
      if (batchClosed || exceedsBatch) {
        batchClosed = true;
        deferred += 1;
        continue;
      }

      operations.push(operation);
      batchBytes += operationBytes;
    } catch (error) {
      actions.push({
        type: "quarantine",
        opId: row.op_id,
        reason: boundedError(error instanceof Error ? error.message : String(error)),
        payloadJson: row.payload_json,
      });
    }
  }

  return { operations, actions, deferred, batchBytes };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function reconcileOutbox(
  submitted: PreparedOfflineOperation[],
  results: unknown,
): OutboxAction[] {
  if (!Array.isArray(results)) throw new Error("Offline batch response did not contain a results array.");

  const knownIds = new Set(submitted.map((operation) => operation.opId));
  const resultById = new Map<string, Record<string, unknown>>();
  for (const candidate of results) {
    if (!isObject(candidate) || typeof candidate.opId !== "string" || !knownIds.has(candidate.opId)) {
      continue;
    }
    if (!resultById.has(candidate.opId)) resultById.set(candidate.opId, candidate);
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
    if (result.ok === true) return { type: "delete", opId: operation.opId };
    if (result.ok !== false) {
      return {
        type: "fail",
        opId: operation.opId,
        error: "server returned a malformed acknowledgement",
      };
    }

    const conflict = isObject(result.conflict) ? result.conflict.currentVersion : undefined;
    if (typeof conflict === "number" && Number.isSafeInteger(conflict) && conflict >= 0) {
      return {
        type: "fail",
        opId: operation.opId,
        error: `conflict: server version ${conflict}`,
      };
    }
    return {
      type: "fail",
      opId: operation.opId,
      error: boundedError(typeof result.error === "string" ? result.error : "unknown server error"),
    };
  });
}
