import { readFileSync } from "node:fs";
import {
  OPERATION_KINDS,
  OPERATION_STATES,
  OPERATIONS_ENDPOINTS,
  type BackupRequest,
  type ControllerStatus,
  type MaintenanceEnterRequest,
  type MaintenanceExitRequest,
  type OperationList,
  type OperationRecord,
  type RestoreCommitRequest,
  type RestoreProofRequest,
  type RestoreValidateRequest,
  type UpgradeRequest,
} from "@ofp/shared";
import { z } from "zod";

export interface OperationsClientOptions {
  baseUrl: string;
  secretFile: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface OperationsClient {
  status(): Promise<ControllerStatus>;
  listOperations(): Promise<OperationList>;
  getOperation(id: string): Promise<OperationRecord>;
  backup(body: BackupRequest, idempotencyKey: string): Promise<OperationRecord>;
  restoreProof(body: RestoreProofRequest, idempotencyKey: string): Promise<OperationRecord>;
  upgrade(body: UpgradeRequest, idempotencyKey: string): Promise<OperationRecord>;
  restoreValidate(body: RestoreValidateRequest, idempotencyKey: string): Promise<OperationRecord>;
  restoreCommit(body: RestoreCommitRequest, idempotencyKey: string): Promise<OperationRecord>;
  maintenanceEnter(body: MaintenanceEnterRequest, idempotencyKey: string): Promise<OperationRecord>;
  maintenanceExit(body: MaintenanceExitRequest, idempotencyKey: string): Promise<OperationRecord>;
}

export class OperationsControllerUnavailableError extends Error {}

export class OperationsControllerResponseError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly body: { error: string },
  ) {
    super(body.error);
  }
}

const operationSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(OPERATION_KINDS),
    state: z.enum(OPERATION_STATES),
    requestedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    error: z.string().max(500).optional(),
  })
  .strict();

const statusSchema = z
  .object({
    contractVersion: z.literal("v1"),
    status: z.literal("ready"),
    maintenance: z.boolean(),
  })
  .strict();

const operationListSchema = z.object({ operations: z.array(operationSchema) }).strict();

export function readOperationsSecret(secretFile: string): string {
  let bytes = readFileSync(secretFile);
  if (bytes.at(-1) === 0x0a) {
    bytes = bytes.subarray(0, bytes.at(-2) === 0x0d ? bytes.length - 2 : bytes.length - 1);
  }
  if (bytes.length < 32) throw new Error("operations controller secret must be at least 32 bytes");
  if (bytes.length > 512) throw new Error("operations controller secret must be at most 512 bytes");
  const secret = bytes.toString("utf8");
  if (!Buffer.from(secret, "utf8").equals(bytes) || !/^[\x21-\x7e]+$/.test(secret)) {
    throw new Error("operations controller secret must use visible ASCII");
  }
  return secret;
}

function controllerOrigin(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("operations controller URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("operations controller URL must not contain credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("operations controller URL must contain an origin only");
  }
  return url;
}

function responseErrorBody(value: unknown): { error: string } {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return { error: value.error.slice(0, 200) };
  }
  return { error: "operations controller rejected the request" };
}

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error("controller response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      total += value.byteLength;
      if (total > 65_536) throw new Error("controller response too large");
      chunks.push(value);
    }
  } catch (error) {
    if (!complete) await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createOperationsClient(options: OperationsClientOptions): OperationsClient {
  const baseUrl = controllerOrigin(options.baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error("operations controller timeout must be 100-30000ms");
  }

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = "GET",
    body?: object,
    idempotencyKey?: string,
  ): Promise<T> {
    let secret: string;
    try {
      secret = readOperationsSecret(options.secretFile);
    } catch {
      throw new OperationsControllerUnavailableError("operations controller unavailable");
    }

    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        method,
        headers: {
          authorization: `Bearer ${secret}`,
          ...(body ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new OperationsControllerUnavailableError("operations controller unavailable");
    }

    let payload: unknown;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedResponse(response),
      );
      payload = JSON.parse(text);
    } catch {
      throw new OperationsControllerUnavailableError("operations controller unavailable");
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 404 || response.status === 409) {
        throw new OperationsControllerResponseError(response.status, responseErrorBody(payload));
      }
      throw new OperationsControllerUnavailableError("operations controller unavailable");
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new OperationsControllerUnavailableError("operations controller unavailable");
    }
    return parsed.data;
  }

  const mutate = <T extends object>(path: string, body: T, idempotencyKey: string) =>
    request(path, operationSchema, "POST", body, idempotencyKey);

  return {
    status: () => request(OPERATIONS_ENDPOINTS.status, statusSchema),
    listOperations: () => request(OPERATIONS_ENDPOINTS.operations, operationListSchema),
    getOperation: (id) =>
      request(OPERATIONS_ENDPOINTS.operation.replace(":id", encodeURIComponent(id)), operationSchema),
    backup: (body, key) => mutate(OPERATIONS_ENDPOINTS.backup, body, key),
    restoreProof: (body, key) => mutate(OPERATIONS_ENDPOINTS.restoreProof, body, key),
    upgrade: (body, key) => mutate(OPERATIONS_ENDPOINTS.upgrade, body, key),
    restoreValidate: (body, key) => mutate(OPERATIONS_ENDPOINTS.restoreValidate, body, key),
    restoreCommit: (body, key) => mutate(OPERATIONS_ENDPOINTS.restoreCommit, body, key),
    maintenanceEnter: (body, key) => mutate(OPERATIONS_ENDPOINTS.maintenanceEnter, body, key),
    maintenanceExit: (body, key) => mutate(OPERATIONS_ENDPOINTS.maintenanceExit, body, key),
  };
}
