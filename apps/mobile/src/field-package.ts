import { utf8ByteLength } from "./utf8";

export const MAX_FIELD_PACKAGE_BYTES = 5_000_000;
export const MAX_FIELD_PACKAGE_STEPS = 2_000;
export const MAX_FIELD_PACKAGE_MEASUREMENTS = 10_000;

const SUPPORT_STATES = new Set([
  "identification_required",
  "workflow_selection_required",
  "unsupported",
  "suspended",
  "validated",
  "pilot",
  "experimental",
]);

export interface FieldPackage {
  packageVersion: number;
  generatedAt: string;
  job: Record<string, unknown>;
  equipment: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  workflow: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  measurements: Array<Record<string, unknown>>;
  supportState: string;
  downloadReady: boolean;
}

export class FieldPackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldPackageValidationError";
  }
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldPackageValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
  if (value === null) return null;
  return objectRecord(value, label);
}

function requiredString(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new FieldPackageValidationError(`${label}.${key} must be a bounded nonempty string`);
  }
  try {
    utf8ByteLength(value);
  } catch {
    throw new FieldPackageValidationError(`${label}.${key} contains malformed Unicode`);
  }
  return value;
}

function assertOrg(record: Record<string, unknown> | null, label: string, orgId: string) {
  if (!record) return;
  if (requiredString(record, "orgId", label) !== orgId) {
    throw new FieldPackageValidationError(`${label} belongs to a different organization`);
  }
}

function assertUniqueIds(records: Array<Record<string, unknown>>, label: string) {
  const ids = new Set<string>();
  for (const [index, record] of records.entries()) {
    const id = requiredString(record, "id", `${label}[${index}]`);
    if (ids.has(id)) {
      throw new FieldPackageValidationError(`${label} contains duplicate id ${id}`);
    }
    ids.add(id);
  }
}

function serializePackage(value: unknown) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new FieldPackageValidationError("field package could not be serialized");
  }
  if (utf8ByteLength(serialized) > MAX_FIELD_PACKAGE_BYTES) {
    throw new FieldPackageValidationError("field package exceeds the 5 MB offline cache limit");
  }
  return serialized;
}

export function validateFieldPackage(
  value: unknown,
  expected: { orgId: string; jobId: string },
): { fieldPackage: FieldPackage; serialized: string } {
  const serialized = serializePackage(value);
  const root = objectRecord(value, "field package");
  if (root.packageVersion !== 1) {
    throw new FieldPackageValidationError("field package version is not supported");
  }
  if (
    typeof root.generatedAt !== "string" ||
    root.generatedAt.length > 64 ||
    !Number.isFinite(Date.parse(root.generatedAt))
  ) {
    throw new FieldPackageValidationError("field package generatedAt is invalid");
  }

  const job = objectRecord(root.job, "job");
  if (requiredString(job, "id", "job") !== expected.jobId) {
    throw new FieldPackageValidationError("field package job does not match the requested job");
  }
  assertOrg(job, "job", expected.orgId);

  const equipment = optionalRecord(root.equipment, "equipment");
  const session = optionalRecord(root.session, "session");
  const workflow = optionalRecord(root.workflow, "workflow");
  assertOrg(equipment, "equipment", expected.orgId);
  assertOrg(session, "session", expected.orgId);
  assertOrg(workflow, "workflow", expected.orgId);

  if (!session && workflow) {
    throw new FieldPackageValidationError("workflow cannot exist without a diagnostic session");
  }
  if (session) {
    if (requiredString(session, "jobId", "session") !== expected.jobId) {
      throw new FieldPackageValidationError("diagnostic session belongs to a different job");
    }
    if (!equipment) {
      throw new FieldPackageValidationError("diagnostic session requires equipment");
    }
    if (requiredString(session, "equipmentId", "session") !== requiredString(equipment, "id", "equipment")) {
      throw new FieldPackageValidationError("diagnostic session and equipment do not match");
    }
    if (workflow && requiredString(session, "workflowId", "session") !== requiredString(workflow, "id", "workflow")) {
      throw new FieldPackageValidationError("diagnostic session and workflow do not match");
    }
  }

  if (!Array.isArray(root.steps) || root.steps.length > MAX_FIELD_PACKAGE_STEPS) {
    throw new FieldPackageValidationError("field package steps are missing or exceed the offline limit");
  }
  const steps = root.steps.map((step, index) => objectRecord(step, `steps[${index}]`));
  assertUniqueIds(steps, "steps");
  if (steps.length > 0 && !workflow) {
    throw new FieldPackageValidationError("field package steps require a workflow");
  }
  if (workflow) {
    const workflowId = requiredString(workflow, "id", "workflow");
    for (const [index, step] of steps.entries()) {
      assertOrg(step, `steps[${index}]`, expected.orgId);
      if (requiredString(step, "workflowId", `steps[${index}]`) !== workflowId) {
        throw new FieldPackageValidationError(`steps[${index}] belongs to a different workflow`);
      }
    }
  }

  if (!Array.isArray(root.measurements) || root.measurements.length > MAX_FIELD_PACKAGE_MEASUREMENTS) {
    throw new FieldPackageValidationError("field package measurements are missing or exceed the offline limit");
  }
  const measurements = root.measurements.map((measurement, index) =>
    objectRecord(measurement, `measurements[${index}]`),
  );
  assertUniqueIds(measurements, "measurements");
  if (measurements.length > 0 && !session) {
    throw new FieldPackageValidationError("field package measurements require a diagnostic session");
  }
  if (session) {
    const sessionId = requiredString(session, "id", "session");
    for (const [index, measurement] of measurements.entries()) {
      assertOrg(measurement, `measurements[${index}]`, expected.orgId);
      if (requiredString(measurement, "sessionId", `measurements[${index}]`) !== sessionId) {
        throw new FieldPackageValidationError(`measurements[${index}] belongs to a different session`);
      }
    }
  }

  if (typeof root.supportState !== "string" || !SUPPORT_STATES.has(root.supportState)) {
    throw new FieldPackageValidationError("field package support state is not supported");
  }
  if (typeof root.downloadReady !== "boolean") {
    throw new FieldPackageValidationError("field package downloadReady must be boolean");
  }
  if (root.downloadReady && (!session || !workflow || steps.length === 0)) {
    throw new FieldPackageValidationError("download-ready package requires a session, workflow, and steps");
  }

  return {
    fieldPackage: {
      packageVersion: root.packageVersion,
      generatedAt: root.generatedAt,
      job,
      equipment,
      session,
      workflow,
      steps,
      measurements,
      supportState: root.supportState,
      downloadReady: root.downloadReady,
    },
    serialized,
  };
}
