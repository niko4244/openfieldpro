// Phase 5a PR 1 — sync route.
// JWT-gated POST /api/sync, accepts SyncRequestDTO, returns SyncResponseDTO.
// Delegates all per-op logic to ../sync/executor.ts (pure dispatcher).

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { applyOps } from "../sync/executor.js";

const REQUEST_Z = z.object({
  ops: z
    .array(
      z
        .object({
          opId: z.string().min(1).max(64),
          type: z.enum(["create", "update", "delete"]),
          table: z.enum([
            "jobs",
            "line_items",
            "invoices",
            "appointments",
            "customers",
            "estimates",
            "payments",
          ]),
          entityId: z.string().uuid(),
          baseVersion: z.number().int().positive().optional(),
          payload: z.record(z.string(), z.unknown()),
        })
        .passthrough(),
    )
    // ponytail: 500-op ceiling keeps a batch under ~1MB JSON and one TCP
    // round-trip for typical mobile flushes. Ceiling: real drop is at
    // ~1000 ops; raise to 1000 if mobile dashboards need larger batches.
    .min(1)
    .max(500),
});

export async function syncRoutes(app: FastifyInstance) {
  app.post("/api/sync", async (req, reply) => {
    // resolveOrgId() calls req.jwtVerify() internally — same pattern as
    // existing routes/jobs.ts and routes/org.ts. No separate onRequest hook.
    const orgId = await resolveOrgId(req);

    const parsed = REQUEST_Z.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad request",
        issues: parsed.error.issues.slice(0, 10),
      });
    }

    const results = await applyOps(db, orgId, parsed.data.ops);
    return { results };
  });
}
