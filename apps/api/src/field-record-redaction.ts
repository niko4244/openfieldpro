import type { UserRole } from "./operational-authorization.js";

export function customerResponseForRole<
  T extends { notes?: string | null },
>(row: T, role: UserRole) {
  if (role !== "technician") return row;
  const { notes: _notes, ...fieldCustomer } = row;
  return { ...fieldCustomer, notesRestricted: true as const };
}

const OFFICE_ACTIVITY_PREFIXES = [
  "invoice.",
  "payment.",
  "estimate.",
  "line_item.",
  "service_plan.",
  "review.",
] as const;

export function activityVisibleToRole(kind: string, role: UserRole) {
  if (role !== "technician") return true;
  return !OFFICE_ACTIVITY_PREFIXES.some((prefix) => kind.startsWith(prefix));
}

const MANUAL_ACTIVITY_KINDS = new Set([
  "customer.note",
  "job.note",
  "technician.note",
]);

export function manualActivityAllowed(
  role: UserRole,
  activity: { kind: string; customerId?: string; jobId?: string },
) {
  if (!MANUAL_ACTIVITY_KINDS.has(activity.kind)) return false;
  if (role !== "technician") return true;
  return activity.kind === "technician.note" && Boolean(activity.jobId);
}
