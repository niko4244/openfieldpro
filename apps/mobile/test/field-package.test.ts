import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FIELD_PACKAGE_MEASUREMENTS,
  MAX_FIELD_PACKAGE_STEPS,
  validateFieldPackage,
} from "../src/field-package.ts";

const expected = { orgId: "org-123", jobId: "job-456" };

function validPackage() {
  return {
    packageVersion: 1,
    generatedAt: "2026-07-13T02:00:00.000Z",
    job: { id: expected.jobId, orgId: expected.orgId, title: "Refrigerator warm" },
    equipment: { id: "equipment-1", orgId: expected.orgId },
    session: {
      id: "session-1",
      orgId: expected.orgId,
      jobId: expected.jobId,
      equipmentId: "equipment-1",
      workflowId: "workflow-1",
      workflowVersion: 3,
    },
    workflow: { id: "workflow-1", orgId: expected.orgId },
    steps: [
      { id: "step-1", orgId: expected.orgId, workflowId: "workflow-1", publicLabel: "Check supply" },
    ],
    measurements: [
      { id: "measurement-1", orgId: expected.orgId, sessionId: "session-1", result: "pass" },
    ],
    supportState: "validated",
    downloadReady: true,
  };
}

test("valid packages are returned with their reviewed serialized representation", () => {
  const source = validPackage();
  const result = validateFieldPackage(source, expected);
  assert.deepEqual(result.fieldPackage, source);
  assert.equal(result.serialized, JSON.stringify(source));
});

test("package version, generated time, support state, and readiness are strict", () => {
  for (const source of [
    { ...validPackage(), packageVersion: 2 },
    { ...validPackage(), generatedAt: "not-a-date" },
    { ...validPackage(), supportState: "unknown" },
    { ...validPackage(), downloadReady: "yes" },
  ]) {
    assert.throws(() => validateFieldPackage(source, expected));
  }
});

test("job and every embedded entity must belong to the authenticated organization", () => {
  assert.throws(
    () => validateFieldPackage({ ...validPackage(), job: { id: "other-job", orgId: expected.orgId } }, expected),
    /requested job/,
  );
  assert.throws(
    () => validateFieldPackage({ ...validPackage(), job: { id: expected.jobId, orgId: "other-org" } }, expected),
    /different organization/,
  );

  const stepOrgMismatch = validPackage();
  stepOrgMismatch.steps = [{ ...stepOrgMismatch.steps[0], orgId: "other-org" }];
  assert.throws(() => validateFieldPackage(stepOrgMismatch, expected), /different organization/);

  const measurementOrgMismatch = validPackage();
  measurementOrgMismatch.measurements = [
    { ...measurementOrgMismatch.measurements[0], orgId: "other-org" },
  ];
  assert.throws(() => validateFieldPackage(measurementOrgMismatch, expected), /different organization/);
});

test("session, equipment, workflow, step, and measurement links must remain coherent", () => {
  const sessionMismatch = validPackage();
  sessionMismatch.session = { ...sessionMismatch.session, jobId: "other-job" };
  assert.throws(() => validateFieldPackage(sessionMismatch, expected), /different job/);

  const equipmentMismatch = validPackage();
  equipmentMismatch.session = { ...equipmentMismatch.session, equipmentId: "other-equipment" };
  assert.throws(() => validateFieldPackage(equipmentMismatch, expected), /equipment do not match/);

  const workflowMismatch = validPackage();
  workflowMismatch.session = { ...workflowMismatch.session, workflowId: "other-workflow" };
  assert.throws(() => validateFieldPackage(workflowMismatch, expected), /workflow do not match/);

  const stepMismatch = validPackage();
  stepMismatch.steps = [{ ...stepMismatch.steps[0], workflowId: "other-workflow" }];
  assert.throws(() => validateFieldPackage(stepMismatch, expected), /different workflow/);

  const measurementMismatch = validPackage();
  measurementMismatch.measurements = [{ ...measurementMismatch.measurements[0], sessionId: "other-session" }];
  assert.throws(() => validateFieldPackage(measurementMismatch, expected), /different session/);
});

test("orphan records and falsely download-ready packages fail closed", () => {
  const workflowWithoutSession = validPackage();
  workflowWithoutSession.session = null;
  workflowWithoutSession.measurements = [];
  assert.throws(() => validateFieldPackage(workflowWithoutSession, expected), /workflow cannot exist/);

  const stepsWithoutWorkflow = validPackage();
  stepsWithoutWorkflow.workflow = null;
  stepsWithoutWorkflow.session = null;
  stepsWithoutWorkflow.measurements = [];
  stepsWithoutWorkflow.downloadReady = false;
  assert.throws(() => validateFieldPackage(stepsWithoutWorkflow, expected), /steps require a workflow/);

  const measurementsWithoutSession = validPackage();
  measurementsWithoutSession.session = null;
  measurementsWithoutSession.workflow = null;
  measurementsWithoutSession.steps = [];
  measurementsWithoutSession.downloadReady = false;
  assert.throws(() => validateFieldPackage(measurementsWithoutSession, expected), /measurements require/);

  const readyWithoutSteps = validPackage();
  readyWithoutSteps.steps = [];
  assert.throws(() => validateFieldPackage(readyWithoutSteps, expected), /download-ready/);
});

test("duplicate step or measurement IDs are rejected", () => {
  const duplicateSteps = validPackage();
  duplicateSteps.steps = [duplicateSteps.steps[0], { ...duplicateSteps.steps[0] }];
  assert.throws(() => validateFieldPackage(duplicateSteps, expected), /duplicate id/);

  const duplicateMeasurements = validPackage();
  duplicateMeasurements.measurements = [
    duplicateMeasurements.measurements[0],
    { ...duplicateMeasurements.measurements[0] },
  ];
  assert.throws(() => validateFieldPackage(duplicateMeasurements, expected), /duplicate id/);
});

test("package collection and serialized-size limits fail closed", () => {
  const tooManySteps = validPackage();
  tooManySteps.steps = Array.from({ length: MAX_FIELD_PACKAGE_STEPS + 1 }, (_, index) => ({
    id: `step-${index}`,
    orgId: expected.orgId,
    workflowId: "workflow-1",
  }));
  assert.throws(() => validateFieldPackage(tooManySteps, expected), /steps/);

  const tooManyMeasurements = validPackage();
  tooManyMeasurements.measurements = Array.from(
    { length: MAX_FIELD_PACKAGE_MEASUREMENTS + 1 },
    (_, index) => ({
      id: `measurement-${index}`,
      orgId: expected.orgId,
      sessionId: "session-1",
    }),
  );
  assert.throws(() => validateFieldPackage(tooManyMeasurements, expected), /measurements/);

  const oversized = validPackage();
  oversized.job = { ...oversized.job, notes: "x".repeat(5_000_001) };
  assert.throws(() => validateFieldPackage(oversized, expected), /5 MB/);
});

test("packages without equipment, session, or workflow remain valid when marked unresolved", () => {
  const source = {
    ...validPackage(),
    equipment: null,
    session: null,
    workflow: null,
    steps: [],
    measurements: [],
    supportState: "identification_required",
    downloadReady: false,
  };
  assert.deepEqual(validateFieldPackage(source, expected).fieldPackage, source);
});
