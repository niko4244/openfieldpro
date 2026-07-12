import { and, eq } from "drizzle-orm";
import { customers, db, diagnosticSessions, equipment, jobs, photos } from "@ofp/db";
import type { JwtClaims } from "./auth.js";

export type AccessClaims = Pick<JwtClaims, "userId" | "orgId" | "role">;

export function isTechnician(claims: AccessClaims) {
  return claims.role === "technician";
}

export async function assignedJobIds(orgId: string, claims: AccessClaims): Promise<string[] | null> {
  if (!isTechnician(claims)) return null;
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.assignedTo, claims.userId)));
  return rows.map((row) => row.id);
}

export async function assignedCustomerIds(orgId: string, claims: AccessClaims): Promise<string[] | null> {
  if (!isTechnician(claims)) return null;
  const rows = await db
    .select({ customerId: jobs.customerId })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.assignedTo, claims.userId)));
  return [...new Set(rows.map((row) => row.customerId))];
}

export async function getAccessibleJob(orgId: string, claims: AccessClaims, jobId: string) {
  const conditions = [eq(jobs.orgId, orgId), eq(jobs.id, jobId)];
  if (isTechnician(claims)) conditions.push(eq(jobs.assignedTo, claims.userId));
  const [row] = await db
    .select({ id: jobs.id, customerId: jobs.customerId, assignedTo: jobs.assignedTo })
    .from(jobs)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

export async function getAccessibleCustomer(orgId: string, claims: AccessClaims, customerId: string) {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)))
    .limit(1);
  if (!customer) return null;
  if (!isTechnician(claims)) return customer;

  const [assigned] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.orgId, orgId),
        eq(jobs.assignedTo, claims.userId),
        eq(jobs.customerId, customerId),
      ),
    )
    .limit(1);
  return assigned ? customer : null;
}

export async function getAccessibleEquipment(orgId: string, claims: AccessClaims, equipmentId: string) {
  const [row] = await db
    .select({ id: equipment.id, customerId: equipment.customerId })
    .from(equipment)
    .where(and(eq(equipment.orgId, orgId), eq(equipment.id, equipmentId)))
    .limit(1);
  if (!row) return null;
  if (!isTechnician(claims)) return row;
  return (await getAccessibleCustomer(orgId, claims, row.customerId)) ? row : null;
}

export async function getAccessiblePhoto(orgId: string, claims: AccessClaims, photoId: string) {
  const [row] = await db
    .select({ id: photos.id, jobId: photos.jobId })
    .from(photos)
    .where(and(eq(photos.orgId, orgId), eq(photos.id, photoId)))
    .limit(1);
  if (!row) return null;
  return (await getAccessibleJob(orgId, claims, row.jobId)) ? row : null;
}

export async function getAccessibleDiagnosticSession(
  orgId: string,
  claims: AccessClaims,
  sessionId: string,
) {
  const [row] = await db
    .select({
      id: diagnosticSessions.id,
      jobId: diagnosticSessions.jobId,
      equipmentId: diagnosticSessions.equipmentId,
      workflowId: diagnosticSessions.workflowId,
    })
    .from(diagnosticSessions)
    .where(and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.id, sessionId)))
    .limit(1);
  if (!row) return null;
  return (await getAccessibleJob(orgId, claims, row.jobId)) ? row : null;
}
