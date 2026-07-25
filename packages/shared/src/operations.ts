export const OPERATIONS_CONTRACT_VERSION = "v1" as const;

export const OPERATIONS_ENDPOINTS = {
  status: "/v1/status",
  operations: "/v1/operations",
  operation: "/v1/operations/:id",
  backup: "/v1/backups",
  restoreProof: "/v1/restore-proofs",
  upgrade: "/v1/upgrades",
  restoreValidate: "/v1/restores/validate",
  restoreCommit: "/v1/restores/commit",
  maintenanceEnter: "/v1/maintenance/enter",
  maintenanceExit: "/v1/maintenance/exit",
} as const;

export const OPERATION_KINDS = [
  "backup",
  "restore_proof",
  "upgrade",
  "restore_validate",
  "restore_commit",
  "maintenance_enter",
  "maintenance_exit",
] as const;

export const OPERATION_STATES = [
  "queued",
  "preflight",
  "maintenance",
  "capturing",
  "encrypting",
  "verifying",
  "replicating",
  "validating",
  "committing",
  "rolling_back",
  "succeeded",
  "failed",
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];
export type OperationState = (typeof OPERATION_STATES)[number];

export interface ControllerStatus {
  contractVersion: typeof OPERATIONS_CONTRACT_VERSION;
  status: "ready";
  maintenance: boolean;
}

export interface OperationRecord {
  id: string;
  kind: OperationKind;
  state: OperationState;
  requestedAt: string;
  completedAt?: string;
  error?: string;
}

export interface OperationList {
  operations: OperationRecord[];
}

export interface BackupRequest {
  label?: string;
}

export interface RestoreProofRequest {
  backupId: string;
}

export interface UpgradeRequest {
  targetVersion: string;
}

export interface RestoreValidateRequest {
  backupId: string;
}

export interface RestoreCommitRequest {
  validationOperationId: string;
}

export interface MaintenanceEnterRequest {
  reason: string;
}

export type MaintenanceExitRequest = Record<string, never>;
