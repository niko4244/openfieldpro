export const STORAGE_SCHEMA_VERSION = 2;

export class OfflineStorageError extends Error {
  readonly terminalStorageFailure = true;

  constructor(message: string) {
    super(message);
    this.name = "OfflineStorageError";
  }
}

export interface StoredStorageIdentity {
  org_id: string;
  user_id: string;
  schema_version: number;
}

export type StorageIdentityDecision = "initialize" | "verified";

export function storageIdentityDecision(
  stored: StoredStorageIdentity | null,
  expected: { orgId: string; userId: string },
): StorageIdentityDecision {
  if (!stored) return "initialize";
  if (stored.org_id !== expected.orgId || stored.user_id !== expected.userId) {
    throw new OfflineStorageError(
      "Offline storage identity mismatch. This cache cannot be opened for the signed-in account.",
    );
  }
  if (stored.schema_version !== STORAGE_SCHEMA_VERSION) {
    throw new OfflineStorageError(
      "Offline storage schema is not supported by this application version.",
    );
  }
  return "verified";
}
