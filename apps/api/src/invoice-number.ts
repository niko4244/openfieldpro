export function normalizeInvoicePrefix(prefix?: string | null) {
  const normalized = (prefix ?? "INV").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return normalized || "INV";
}

export function formatInvoiceNumber(prefix: string | null | undefined, sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("invoice sequence must be a positive integer");
  return `${normalizeInvoicePrefix(prefix)}-${String(sequence).padStart(4, "0")}`;
}

export function nextInvoiceSequence(existingCount: number) {
  if (!Number.isInteger(existingCount) || existingCount < 0) throw new Error("existing invoice count must be a non-negative integer");
  return existingCount + 1;
}
