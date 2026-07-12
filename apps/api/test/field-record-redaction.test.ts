import assert from "node:assert/strict";
import test from "node:test";
import {
  activityVisibleToRole,
  customerResponseForRole,
  manualActivityAllowed,
} from "../src/field-record-redaction.js";

const customer = {
  id: "customer-1",
  name: "Taylor Morgan",
  email: "taylor@example.test",
  phone: "515-555-0101",
  notes: "Office-only collections and access context",
};

test("technician customer payloads omit free-form office notes", () => {
  const response = customerResponseForRole(customer, "technician");
  assert.equal("notes" in response, false);
  assert.equal(response.notesRestricted, true);
  assert.equal(response.name, customer.name);
  assert.equal(response.phone, customer.phone);
});

test("office customer payloads preserve notes", () => {
  assert.deepEqual(customerResponseForRole(customer, "owner"), customer);
  assert.deepEqual(customerResponseForRole(customer, "dispatcher"), customer);
});

test("technician activity timelines exclude billing and office workflow summaries", () => {
  for (const kind of [
    "invoice.created",
    "payment.received",
    "estimate.accepted",
    "line_item.added",
    "service_plan.enrolled",
    "review.received",
  ]) {
    assert.equal(activityVisibleToRole(kind, "technician"), false, kind);
  }

  for (const kind of [
    "job.created",
    "job.status_changed",
    "equipment.recorded",
    "photo.uploaded",
    "technician.note",
  ]) {
    assert.equal(activityVisibleToRole(kind, "technician"), true, kind);
  }
});

test("office roles retain the complete activity timeline", () => {
  assert.equal(activityVisibleToRole("payment.received", "owner"), true);
  assert.equal(activityVisibleToRole("invoice.created", "dispatcher"), true);
});

test("manual activity creation cannot spoof system events", () => {
  for (const role of ["owner", "dispatcher", "technician"] as const) {
    assert.equal(
      manualActivityAllowed(role, {
        kind: "payment.received",
        jobId: "job-1",
      }),
      false,
    );
    assert.equal(
      manualActivityAllowed(role, {
        kind: "invoice.created",
        jobId: "job-1",
      }),
      false,
    );
  }
});

test("technicians may add only technician notes tied to assigned jobs", () => {
  assert.equal(
    manualActivityAllowed("technician", {
      kind: "technician.note",
      jobId: "job-1",
    }),
    true,
  );
  assert.equal(
    manualActivityAllowed("technician", {
      kind: "technician.note",
      customerId: "customer-1",
    }),
    false,
  );
  assert.equal(
    manualActivityAllowed("technician", {
      kind: "job.note",
      jobId: "job-1",
    }),
    false,
  );
});

test("office users may add explicit customer and job notes", () => {
  assert.equal(
    manualActivityAllowed("owner", {
      kind: "customer.note",
      customerId: "customer-1",
    }),
    true,
  );
  assert.equal(
    manualActivityAllowed("dispatcher", {
      kind: "job.note",
      jobId: "job-1",
    }),
    true,
  );
});
