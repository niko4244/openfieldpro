import type { FastifyReply, FastifyRequest } from "fastify";
import { verifiedClaims } from "./operational-authorization.js";
import {
  getAccessibleDiagnosticSession,
  getAccessibleEquipment,
  getAccessibleJob,
  isTechnician,
} from "./field-access.js";
import { resolveOrgId } from "./routes/org.js";

export type DiagnosticRouteKind =
  | "field-package"
  | "job-equipment-read"
  | "job-equipment-write"
  | "session-list"
  | "session-create"
  | "session-record"
  | "estimate-handoff"
  | "offline-batch"
  | "correction-create"
  | null;

export function classifyDiagnosticRoute(method: string, rawUrl: string): DiagnosticRouteKind {
  const normalizedMethod = method.toUpperCase();
  const path = rawUrl.split("?")[0] ?? rawUrl;
  if (normalizedMethod === "OPTIONS" || !path.startsWith("/api/diagnostics/")) return null;
  if (normalizedMethod === "GET" && /^\/api\/diagnostics\/field-package\/[^/]+$/.test(path)) {
    return "field-package";
  }
  if (normalizedMethod === "GET" && /^\/api\/diagnostics\/job-equipment\/[^/]+$/.test(path)) {
    return "job-equipment-read";
  }
  if (normalizedMethod === "POST" && path === "/api/diagnostics/job-equipment") {
    return "job-equipment-write";
  }
  if (normalizedMethod === "GET" && path === "/api/diagnostics/sessions") return "session-list";
  if (normalizedMethod === "POST" && path === "/api/diagnostics/sessions") return "session-create";
  if (
    normalizedMethod === "POST" &&
    /^\/api\/diagnostics\/sessions\/[^/]+\/estimate-handoff$/.test(path)
  ) {
    return "estimate-handoff";
  }
  if (
    ["GET", "PATCH", "POST"].includes(normalizedMethod) &&
    /^\/api\/diagnostics\/sessions\/[^/]+(?:\/(?:measurements|output|complete))?$/.test(path)
  ) {
    return "session-record";
  }
  if (normalizedMethod === "POST" && path === "/api/diagnostics/offline-batch") {
    return "offline-batch";
  }
  if (normalizedMethod === "POST" && path === "/api/diagnostics/corrections") {
    return "correction-create";
  }
  return null;
}

function pathId(path: string, marker: string) {
  const tail = path.slice(path.indexOf(marker) + marker.length);
  return tail.split("/")[0] || null;
}

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  orgId: string,
  claims: Awaited<ReturnType<typeof verifiedClaims>>,
  sessionId: string,
) {
  if (!claims) return null;
  const session = await getAccessibleDiagnosticSession(orgId, claims, sessionId);
  if (!session) {
    await reply.code(404).send({ error: "diagnostic session not found" });
    return null;
  }
  return session;
}

export async function diagnosticAccessGuard(request: FastifyRequest, reply: FastifyReply) {
  const kind = classifyDiagnosticRoute(request.method, request.url);
  if (!kind) return;

  const claims = await verifiedClaims(request, reply);
  if (!claims || reply.sent) return;
  const orgId = await resolveOrgId(request);
  const path = request.url.split("?")[0] ?? request.url;

  if (kind === "field-package" || kind === "job-equipment-read") {
    const marker = kind === "field-package"
      ? "/api/diagnostics/field-package/"
      : "/api/diagnostics/job-equipment/";
    const jobId = pathId(path, marker);
    if (jobId && !(await getAccessibleJob(orgId, claims, jobId))) {
      await reply.code(404).send({ error: "job not found" });
    }
    return;
  }

  if (kind === "job-equipment-write" || kind === "session-create") {
    const body = request.body as { jobId?: unknown; equipmentId?: unknown } | undefined;
    if (typeof body?.jobId !== "string" || typeof body.equipmentId !== "string") return;
    const [job, appliance] = await Promise.all([
      getAccessibleJob(orgId, claims, body.jobId),
      getAccessibleEquipment(orgId, claims, body.equipmentId),
    ]);
    if (!job || !appliance) {
      await reply.code(404).send({ error: "job or equipment not found" });
      return;
    }
    if (job.customerId !== appliance.customerId) {
      await reply.code(409).send({ error: "equipment does not belong to the job customer" });
    }
    return;
  }

  if (kind === "session-list") {
    if (!isTechnician(claims)) return;
    const query = request.query as { jobId?: unknown } | undefined;
    if (typeof query?.jobId !== "string") {
      await reply.code(400).send({
        error: "technician diagnostic session lists must specify an assigned jobId",
      });
      return;
    }
    if (!(await getAccessibleJob(orgId, claims, query.jobId))) {
      await reply.code(404).send({ error: "job not found" });
    }
    return;
  }

  if (kind === "session-record" || kind === "estimate-handoff") {
    if (kind === "estimate-handoff" && isTechnician(claims)) {
      await reply.code(403).send({ error: "estimate handoff requires office access" });
      return;
    }
    const sessionId = pathId(path, "/api/diagnostics/sessions/");
    if (sessionId) await requireSession(request, reply, orgId, claims, sessionId);
    return;
  }

  if (kind === "correction-create") {
    const body = request.body as {
      sessionId?: unknown;
      workflowId?: unknown;
    } | undefined;
    if (!isTechnician(claims)) return;
    if (typeof body?.sessionId !== "string") {
      await reply.code(400).send({
        error: "technician correction reports require an assigned diagnostic session",
      });
      return;
    }
    const session = await requireSession(request, reply, orgId, claims, body.sessionId);
    if (!session || reply.sent) return;
    if (typeof body.workflowId === "string" && session.workflowId !== body.workflowId) {
      await reply.code(409).send({ error: "workflow does not belong to the diagnostic session" });
    }
    return;
  }

  const batch = request.body as {
    ops?: Array<{
      kind?: unknown;
      payload?: { sessionId?: unknown; workflowId?: unknown };
    }>;
  } | undefined;
  if (!Array.isArray(batch?.ops)) return;

  for (const operation of batch.ops) {
    const sessionId = operation.payload?.sessionId;
    if (operation.kind === "correction.create" && isTechnician(claims) && typeof sessionId !== "string") {
      await reply.code(400).send({
        error: "technician offline corrections require an assigned diagnostic session",
      });
      return;
    }
    if (typeof sessionId !== "string") continue;
    const session = await requireSession(request, reply, orgId, claims, sessionId);
    if (!session || reply.sent) return;
    if (
      operation.kind === "correction.create" &&
      typeof operation.payload?.workflowId === "string" &&
      session.workflowId !== operation.payload.workflowId
    ) {
      await reply.code(409).send({ error: "workflow does not belong to the diagnostic session" });
      return;
    }
  }
}
