import assert from "node:assert/strict";
import test from "node:test";
import { jobResponseForRole } from "../src/routes/jobs.js";
import { lineItemResponseForRole } from "../src/routes/lineitems.js";

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
