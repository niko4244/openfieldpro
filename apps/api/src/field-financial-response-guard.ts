import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtClaims } from "./auth.js";
import { assignedJobIds } from "./field-access.js";
import { diagnosticPackageResponseForRole } from "./field-financials.js";
import type { UserRole } from "./operational-authorization.js";

export function isDiagnosticFieldPackageRequest(method: string, rawUrl: string) {
  const path = rawUrl.split("?")[0] ?? rawUrl;
  return (
    method.toUpperCase() === "GET" &&
    /^\/api\/diagnostics\/field-package\/[^/]+$/.test(path)
  );
}

export function isDiagnosticSessionListRequest(method: string, rawUrl: string) {
  const path = rawUrl.split("?")[0] ?? rawUrl;
  return method.toUpperCase() === "GET" && path === "/api/diagnostics/sessions";
}

export function filterDiagnosticSessionsForAssignedJobs(
  payload: unknown,
  accessibleJobIds: readonly string[],
) {
  if (!Array.isArray(payload)) return payload;
  const allowed = new Set(accessibleJobIds);
  return payload.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const session = (row as { session?: unknown }).session;
    if (!session || typeof session !== "object") return false;
    const jobId = (session as { jobId?: unknown }).jobId;
    return typeof jobId === "string" && allowed.has(jobId);
  });
}

export async function fieldFinancialResponseGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: unknown,
) {
  const claims = request.user as JwtClaims | undefined;
  if (claims?.role !== "technician") return payload;

  if (isDiagnosticSessionListRequest(request.method, request.url)) {
    const accessible = await assignedJobIds(claims.orgId, claims);
    return filterDiagnosticSessionsForAssignedJobs(payload, accessible ?? []);
  }

  if (
    isDiagnosticFieldPackageRequest(request.method, request.url) &&
    payload &&
    typeof payload === "object"
  ) {
    return diagnosticPackageResponseForRole(
      payload as { job?: ({ total: number; laborCostCents: number } & Record<string, unknown>) | null },
      claims.role as UserRole,
    );
  }

  return payload;
}
