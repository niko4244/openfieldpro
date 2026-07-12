import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogItemResponseForRole,
  diagnosticPackageResponseForRole,
  jobResponseForRole,
  lineItemResponseForRole,
} from "../src/field-financials.js";
import {
  filterDiagnosticSessionsForAssignedJobs,
  isDiagnosticFieldPackageRequest,
  isDiagnosticSessionListRequest,
} from "../src/field-financial-response-guard.js";

const job = {
  id: "job-1",
  title: "Washer not draining",
  total: 24900,
  laborCostCents: 6500,
};

const lineItem = {
  id: "line-1",
  description: "Drain pump",
  quantity: 1,
  unitPrice: 18900,
  unitCost: 7200,
};

const catalogItem = {
  id: "catalog-1",
  name: "Drain pump replacement",
  priceCents: 18900,
  costCents: 7200,
};

test("technician job responses omit financial fields instead of zeroing them", () => {
  const response = jobResponseForRole(job, "technician");
  assert.equal("total" in response, false);
  assert.equal("laborCostCents" in response, false);
  assert.equal(response.financialsRestricted, true);
  assert.equal(response.title, job.title);
});

test("office job responses preserve financial fields", () => {
  assert.deepEqual(jobResponseForRole(job, "owner"), job);
  assert.deepEqual(jobResponseForRole(job, "dispatcher"), job);
});

test("technician line-item responses retain field context but omit pricing", () => {
  const response = lineItemResponseForRole(lineItem, "technician");
  assert.equal("unitPrice" in response, false);
  assert.equal("unitCost" in response, false);
  assert.equal(response.financialsRestricted, true);
  assert.equal(response.description, lineItem.description);
  assert.equal(response.quantity, lineItem.quantity);
});

test("office line-item responses preserve pricing", () => {
  assert.deepEqual(lineItemResponseForRole(lineItem, "owner"), lineItem);
  assert.deepEqual(lineItemResponseForRole(lineItem, "dispatcher"), lineItem);
});

test("technician catalog reads preserve selling price but omit internal cost", () => {
  const response = catalogItemResponseForRole(catalogItem, "technician");
  assert.equal(response.priceCents, catalogItem.priceCents);
  assert.equal("costCents" in response, false);
  assert.equal(response.costRestricted, true);
});

test("office catalog reads preserve selling price and internal cost", () => {
  assert.deepEqual(catalogItemResponseForRole(catalogItem, "owner"), catalogItem);
  assert.deepEqual(catalogItemResponseForRole(catalogItem, "dispatcher"), catalogItem);
});

test("downloaded technician field packages cannot reintroduce job financials", () => {
  const payload = {
    packageVersion: 1,
    job,
    equipment: null,
  };
  const response = diagnosticPackageResponseForRole(payload, "technician");
  assert.ok(response.job);
  assert.equal("total" in response.job, false);
  assert.equal("laborCostCents" in response.job, false);
  assert.equal(response.job.financialsRestricted, true);
});

test("technician diagnostic bulk lists retain only sessions for assigned jobs", () => {
  const payload = [
    { session: { id: "session-1", jobId: "job-1" } },
    { session: { id: "session-2", jobId: "job-2" } },
    { session: { id: "session-3", jobId: "job-3" } },
  ];
  assert.deepEqual(filterDiagnosticSessionsForAssignedJobs(payload, ["job-1", "job-3"]), [
    payload[0],
    payload[2],
  ]);
  assert.deepEqual(filterDiagnosticSessionsForAssignedJobs(payload, []), []);
});

test("financial and assignment response hooks target exact GET routes", () => {
  assert.equal(
    isDiagnosticFieldPackageRequest("GET", "/api/diagnostics/field-package/job-1?fresh=true"),
    true,
  );
  assert.equal(
    isDiagnosticFieldPackageRequest("POST", "/api/diagnostics/field-package/job-1"),
    false,
  );
  assert.equal(isDiagnosticFieldPackageRequest("GET", "/api/diagnostics/sessions"), false);
  assert.equal(
    isDiagnosticSessionListRequest("GET", "/api/diagnostics/sessions?status=testing"),
    true,
  );
  assert.equal(isDiagnosticSessionListRequest("POST", "/api/diagnostics/sessions"), false);
});
