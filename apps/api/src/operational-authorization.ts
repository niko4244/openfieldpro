import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtClaims } from "./auth.js";

export type UserRole = "owner" | "dispatcher" | "technician";

const OWNER_ONLY_WRITE_PREFIXES = [
  "/api/users",
  "/api/org",
  "/api/plugins",
];

const OFFICE_WRITE_PREFIXES = [
  "/api/appointments",
  "/api/customers",
  "/api/estimates",
  "/api/invoices",
  "/api/catalog",
  "/api/service-plans",
  "/api/recurring",
  "/api/reviews",
];

export function requiredRolesForRequest(method: string, rawUrl: string): UserRole[] | null {
  const path = rawUrl.split("?")[0] ?? rawUrl;
  if (path === "/api/operations" || path.startsWith("/api/operations/")) return ["owner"];
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return null;

  if (OWNER_ONLY_WRITE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return ["owner"];
  }
  if (OFFICE_WRITE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return ["owner", "dispatcher"];
  }
  if (path === "/api/jobs" && method.toUpperCase() === "POST") {
    return ["owner", "dispatcher"];
  }

  return null;
}

export async function verifiedClaims(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<JwtClaims | null> {
  try {
    await request.jwtVerify();
    const claims = request.user as JwtClaims;
    if (!claims?.orgId || !claims?.userId || !["owner", "dispatcher", "technician"].includes(claims.role)) {
      await reply.code(401).send({ error: "invalid authentication claims" });
      return null;
    }
    return claims;
  } catch {
    if (process.env.NODE_ENV !== "production" && !request.headers.authorization) {
      return { userId: "development-owner", orgId: "development", role: "owner" };
    }
    await reply.code(401).send({ error: "authentication required" });
    return null;
  }
}

export async function operationalAuthorizationGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const required = requiredRolesForRequest(request.method, request.url);
  if (!required) return;

  const claims = await verifiedClaims(request, reply);
  if (!claims || reply.sent) return;
  if (!required.includes(claims.role as UserRole)) {
    await reply.code(403).send({
      error: "insufficient role for this operation",
      requiredRoles: required,
    });
  }
}

export function technicianJobPatchAllowed(payload: Record<string, unknown>) {
  const keys = Object.keys(payload);
  return (
    keys.length === 1 &&
    keys[0] === "status" &&
    (payload.status === "in_progress" || payload.status === "completed")
  );
}

const CANONICAL_API_ONLY_SYNC_TABLES = new Set(["invoices", "payments", "estimates"]);
const TECHNICIAN_SYNC_TABLES = new Set(["jobs", "line_items"]);

export function roleCanSyncOperation(
  role: UserRole,
  operation: { table: string; type: string; payload: Record<string, unknown> },
) {
  if (CANONICAL_API_ONLY_SYNC_TABLES.has(operation.table)) return false;
  if (role === "owner" || role === "dispatcher") return true;
  if (!TECHNICIAN_SYNC_TABLES.has(operation.table)) return false;
  if (operation.table === "jobs") {
    return operation.type === "update" && technicianJobPatchAllowed(operation.payload);
  }
  return operation.table === "line_items" && ["create", "update", "delete"].includes(operation.type);
}
