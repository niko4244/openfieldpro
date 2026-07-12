import type { UserRole } from "./operational-authorization.js";

type JobFinancialFields = {
  total: number;
  laborCostCents: number;
};

type LineItemFinancialFields = {
  unitPrice: number;
  unitCost: number;
};

type CatalogCostField = {
  costCents: number;
};

export function jobResponseForRole<T extends JobFinancialFields>(row: T, role: UserRole) {
  if (role !== "technician") return row;
  const { total: _total, laborCostCents: _laborCostCents, ...fieldJob } = row;
  return { ...fieldJob, financialsRestricted: true as const };
}

export function lineItemResponseForRole<T extends LineItemFinancialFields>(row: T, role: UserRole) {
  if (role !== "technician") return row;
  const { unitPrice: _unitPrice, unitCost: _unitCost, ...fieldItem } = row;
  return { ...fieldItem, financialsRestricted: true as const };
}

export function catalogItemResponseForRole<T extends CatalogCostField>(row: T, role: UserRole) {
  if (role !== "technician") return row;
  const { costCents: _costCents, ...fieldItem } = row;
  return { ...fieldItem, costRestricted: true as const };
}

export function diagnosticPackageResponseForRole<
  T extends { job?: (JobFinancialFields & Record<string, unknown>) | null },
>(payload: T, role: UserRole) {
  if (role !== "technician" || !payload.job) return payload;
  return {
    ...payload,
    job: jobResponseForRole(payload.job, role),
  };
}
