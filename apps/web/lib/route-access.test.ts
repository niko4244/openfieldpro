import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicAssetPath,
  isPublicRoute,
  isTechnicianRoute,
  routeAccessDecision,
  safeWorkspaceReturnPath,
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

test("future nested portal and login routes fail closed by default", () => {
  for (const pathname of [
    "/login/reset",
    "/portal/customer-token/admin",
    "/portal/customer-token/invoices",
  ]) {
    assert.equal(isPublicRoute(pathname), false, pathname);
    assert.equal(routeAccessDecision(pathname, null), "authentication-required", pathname);
  }
});

test("only explicit public metadata files bypass workspace authorization", () => {
  for (const pathname of [
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/icon.png",
    "/apple-icon.png",
    "/opengraph-image.png",
    "/twitter-image.png",
  ]) {
    assert.equal(isPublicAssetPath(pathname), true, pathname);
  }
  for (const pathname of [
    "/invoices/invoice-1.pdf",
    "/jobs/job-1.json",
    "/customers/customer-1.csv",
    "/settings/team.js",
  ]) {
    assert.equal(isPublicAssetPath(pathname), false, pathname);
  }
});

test("private surfaces require authentication", () => {
  for (const pathname of [
    "/",
    "/jobs",
    "/customers",
    "/invoices",
    "/invoices/invoice-1.pdf",
    "/settings",
  ]) {
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

test("technicians may open assigned field routes and UUID diagnostic sessions only", () => {
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
    "/jobs/job-assigned/admin",
    "/customers/customer-assigned/billing",
    "/dispatch",
    "/schedule",
    "/pipeline",
    "/diagnostics",
    "/diagnostics/quality",
    "/diagnostics/not-a-session-id",
    `/diagnostics/${sessionId}/estimate-handoff`,
    "/diagnostic-library",
    "/coverage",
    "/estimates",
    "/invoices",
    "/invoices/invoice-1.pdf",
    "/service-plans",
    "/documents",
    "/reports",
    "/integrations",
    "/settings",
  ]) {
    assert.equal(routeAccessDecision(pathname, "technician"), "forbidden", pathname);
  }
});

test("sign-in return paths are same-origin and fail closed", () => {
  assert.equal(safeWorkspaceReturnPath("/jobs/job-1?tab=activity"), "/jobs/job-1?tab=activity");
  assert.equal(safeWorkspaceReturnPath("https://evil.example/steal"), "/");
  assert.equal(safeWorkspaceReturnPath("//evil.example/steal"), "/");
  assert.equal(safeWorkspaceReturnPath("/\\evil.example/steal"), "/");
  assert.equal(safeWorkspaceReturnPath("javascript:alert(1)"), "/");
  assert.equal(safeWorkspaceReturnPath(null), "/");
});

test("unknown roles fail closed while authenticated users may view access denied", () => {
  assert.equal(routeAccessDecision("/jobs", "unexpected"), "forbidden");
  assert.equal(routeAccessDecision("/access-denied", "technician"), "allowed");
  assert.equal(routeAccessDecision("/access-denied", "dispatcher"), "allowed");
});
