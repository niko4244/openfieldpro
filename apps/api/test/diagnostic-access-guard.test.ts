import assert from "node:assert/strict";
import test from "node:test";
import { classifyDiagnosticRoute } from "../src/diagnostic-access-guard.js";

test("diagnostic field and session routes are classified for assignment checks", () => {
  assert.equal(
    classifyDiagnosticRoute("GET", "/api/diagnostics/field-package/job-1"),
    "field-package",
  );
  assert.equal(
    classifyDiagnosticRoute("GET", "/api/diagnostics/job-equipment/job-1"),
    "job-equipment-read",
  );
  assert.equal(
    classifyDiagnosticRoute("POST", "/api/diagnostics/job-equipment"),
    "job-equipment-write",
  );
  assert.equal(classifyDiagnosticRoute("GET", "/api/diagnostics/sessions"), "session-list");
  assert.equal(classifyDiagnosticRoute("POST", "/api/diagnostics/sessions"), "session-create");
  assert.equal(
    classifyDiagnosticRoute("GET", "/api/diagnostics/sessions/session-1"),
    "session-record",
  );
  assert.equal(
    classifyDiagnosticRoute("POST", "/api/diagnostics/sessions/session-1/measurements"),
    "session-record",
  );
  assert.equal(
    classifyDiagnosticRoute("GET", "/api/diagnostics/sessions/session-1/output"),
    "session-record",
  );
  assert.equal(
    classifyDiagnosticRoute("POST", "/api/diagnostics/sessions/session-1/complete"),
    "session-record",
  );
  assert.equal(
    classifyDiagnosticRoute("POST", "/api/diagnostics/sessions/session-1/estimate-handoff"),
    "estimate-handoff",
  );
  assert.equal(
    classifyDiagnosticRoute("POST", "/api/diagnostics/offline-batch"),
    "offline-batch",
  );
  assert.equal(
    classifyDiagnosticRoute("POST", "/api/diagnostics/corrections"),
    "correction-create",
  );
});

test("administration and preflight routes are left to their dedicated guards", () => {
  assert.equal(classifyDiagnosticRoute("GET", "/api/diagnostics/overview"), null);
  assert.equal(classifyDiagnosticRoute("GET", "/api/diagnostics/workflows"), null);
  assert.equal(classifyDiagnosticRoute("PATCH", "/api/diagnostics/corrections/id"), null);
  assert.equal(classifyDiagnosticRoute("OPTIONS", "/api/diagnostics/sessions"), null);
  assert.equal(classifyDiagnosticRoute("GET", "/api/jobs"), null);
});
