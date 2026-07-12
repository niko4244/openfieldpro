import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicRoute,
  isTechnicianRoute,
  routeAccessDecision,
} from "./route-access";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";

test("public surfaces remain available without a workspace session", () => {
  for (const pathname of [
    "/login",
    "/welcome",
    "/welcome/getting-started",
    "/portal",
    "/portal/customer-token",
  ]) {
    assert.equal(isPublicRoute(pathname), true, pathname);
    assert.equal(routeAccessDecision(pathname, null), "public", pathname);
  }
});

test("private surfaces require authentication", () => {
  for (const pathname of ["/", "/jobs", "/customers", "/invoices", "/settings"]) {
    assert.equal(routeAccessDecision(pathname, null), "authentication-required", pathname);
  }
});

test("owners may open every private workspace route", () => {
  for (const pathname of [
    "/",
    "/jobs/new",
    "/dispatch",
    "/invoices/invoice-1",
    "/diagnostic-library",
    "/integrations",
    "/settings/team",
  ]) {
    assert.equal(routeAccessDecision(pathname, "owner"), "allowed", pathname);
  }
});

test("dispatchers retain office routes but not owner administration", () => {
  for (const pathname of [
    "/jobs/new",
    "/dispatch",
    "/invoices",
    "/reports",
    "/diagnostic-library",
  ]) {
    assert.equal(routeAccessDecision(pathname, "dispatcher"), "allowed", pathname);
  }
  for (const pathname of ["/integrations", "/integrations/plugin-1", "/settings", "/settings/team"]) {
    assert.equal(routeAccessDecision(pathname, "dispatcher"), "forbidden", pathname);
  }
});

test("technicians may open assigned field routes and diagnostic records only", () => {
  for (const pathname of [
    "/",
    "/jobs",
    "/jobs/job-assigned",
    "/closeout",
    "/customers",
    "/customers/customer-assigned",
    "/price-book",
    "/diagnostics/new",
    `/diagnostics/${sessionId}`,
  ]) {
    assert.equal(isTechnicianRoute(pathname), true, pathname);
    assert.equal(routeAccessDecision(pathname, "technician"), "allowed", pathname);
  }

  for (const pathname of [
    "/jobs/new",
    "/dispatch",
    "/schedule",
    "/pipeline",
    "/diagnostics",
    "/diagnostic-library",
    "/coverage",
    "/estimates",
    "/invoices",
    "/service-plans",
    "/documents",
    "/reports",
    "/integrations",
    "/settings",
  ]) {
    assert.equal(routeAccessDecision(pathname, "technician"), "forbidden", pathname);
  }
});

test("unknown roles fail closed while authenticated users may view access denied", () => {
  assert.equal(routeAccessDecision("/jobs", "unexpected"), "forbidden");
  assert.equal(routeAccessDecision("/access-denied", "technician"), "allowed");
  assert.equal(routeAccessDecision("/access-denied", "dispatcher"), "allowed");
});
