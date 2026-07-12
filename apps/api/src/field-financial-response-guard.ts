import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtClaims } from "./auth.js";
import { diagnosticPackageResponseForRole } from "./field-financials.js";
import type { UserRole } from "./operational-authorization.js";

export function isDiagnosticFieldPackageRequest(method: string, rawUrl: string) {
  const path = rawUrl.split("?")[0] ?? rawUrl;
  return (
    method.toUpperCase() === "GET" &&
    /^\/api\/diagnostics\/field-package\/[^/]+$/.test(path)
  );
}

export async function fieldFinancialResponseGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: unknown,
) {
  if (!isDiagnosticFieldPackageRequest(request.method, request.url)) return payload;
  const claims = request.user as JwtClaims | undefined;
  if (claims?.role !== "technician" || !payload || typeof payload !== "object") {
    return payload;
  }
  return diagnosticPackageResponseForRole(
    payload as { job?: ({ total: number; laborCostCents: number } & Record<string, unknown>) | null },
    claims.role as UserRole,
  );
}
