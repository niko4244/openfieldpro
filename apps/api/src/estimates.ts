export function estimateNumber(seq: number, prefix = "EST", nextNumber = 1000): string {
  return `${prefix}-${String(nextNumber + seq).padStart(4, "0")}`;
}

export function defaultEstimateExpiresAt(days: number, now = new Date()): Date | null {
  if (days <= 0) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
