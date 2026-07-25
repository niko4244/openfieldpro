import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  OperationsControllerResponseError,
  OperationsControllerUnavailableError,
  type OperationsClient,
} from "../operations-client.js";

const backupSchema = z.object({ label: z.string().trim().min(1).max(80).optional() }).strict();
const restoreProofSchema = z.object({ backupId: z.string().uuid() }).strict();
const upgradeSchema = z
  .object({ targetVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/) })
  .strict();
const restoreValidateSchema = z.object({ backupId: z.string().uuid() }).strict();
const restoreCommitSchema = z.object({ validationOperationId: z.string().uuid() }).strict();
const maintenanceEnterSchema = z
  .object({ reason: z.string().trim().min(1).max(200) })
  .strict();
const maintenanceExitSchema = z.object({}).strict();
const operationIdSchema = z.string().uuid();
const idempotencyKeySchema = z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/);

function sendControllerError(reply: FastifyReply, error: unknown) {
  if (error instanceof OperationsControllerResponseError) {
    return reply.code(error.status).send(error.body);
  }
  if (error instanceof OperationsControllerUnavailableError) {
    return reply.code(503).send({ error: "operations controller unavailable" });
  }
  throw error;
}

async function mutation<T extends object>(
  request: FastifyRequest,
  reply: FastifyReply,
  schema: z.ZodType<T>,
  run: (body: T, idempotencyKey: string) => Promise<unknown>,
) {
  const body = schema.safeParse(request.body ?? {});
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers["idempotency-key"],
  );
  if (!body.success || !idempotencyKey.success) {
    return reply.code(400).send({ error: "invalid operation request" });
  }
  try {
    return reply.code(202).send(await run(body.data, idempotencyKey.data));
  } catch (error) {
    return sendControllerError(reply, error);
  }
}

export async function operationRoutes(
  app: FastifyInstance,
  options: { client: OperationsClient },
) {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.includes("?")) {
      return reply.code(400).send({ error: "invalid operation request" });
    }
  });

  app.get("/status", async (_request, reply) => {
    try {
      return await options.client.status();
    } catch (error) {
      return sendControllerError(reply, error);
    }
  });

  app.get("/", async (_request, reply) => {
    try {
      return await options.client.listOperations();
    } catch (error) {
      return sendControllerError(reply, error);
    }
  });

  app.get("/:id", async (request, reply) => {
    const id = operationIdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid operation id" });
    try {
      return await options.client.getOperation(id.data);
    } catch (error) {
      return sendControllerError(reply, error);
    }
  });

  app.post("/backups", (request, reply) =>
    mutation(request, reply, backupSchema, options.client.backup));
  app.post("/restore-proofs", (request, reply) =>
    mutation(request, reply, restoreProofSchema, options.client.restoreProof));
  app.post("/upgrades", (request, reply) =>
    mutation(request, reply, upgradeSchema, options.client.upgrade));
  app.post("/restores/validate", (request, reply) =>
    mutation(request, reply, restoreValidateSchema, options.client.restoreValidate));
  app.post("/restores/commit", (request, reply) =>
    mutation(request, reply, restoreCommitSchema, options.client.restoreCommit));
  app.post("/maintenance/enter", (request, reply) =>
    mutation(request, reply, maintenanceEnterSchema, options.client.maintenanceEnter));
  app.post("/maintenance/exit", (request, reply) =>
    mutation(request, reply, maintenanceExitSchema, options.client.maintenanceExit));
}
