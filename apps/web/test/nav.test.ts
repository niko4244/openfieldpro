// Runnable check for activeNavHref (sidebar/mobile-nav "selected" state).
// Run: npx tsx --test ../web/test/nav.test.ts   (from apps/api, which has tsx)
import test from "node:test";
import assert from "node:assert";
import { activeNavHref, NAV_LINKS } from "../lib/nav.ts";

test("root path maps to Dashboard", () => {
  assert.equal(activeNavHref(NAV_LINKS, "/"), "/dashboard");
});

test("exact match wins", () => {
  assert.equal(activeNavHref(NAV_LINKS, "/invoices"), "/invoices");
});

test("detail pages keep their section active", () => {
  assert.equal(activeNavHref(NAV_LINKS, "/invoices/abc-123"), "/invoices");
  assert.equal(activeNavHref(NAV_LINKS, "/customers/abc-123"), "/customers");
});

test("longest prefix wins: dispatch is not dashboard", () => {
  assert.equal(activeNavHref(NAV_LINKS, "/dashboard/dispatch"), "/dashboard/dispatch");
  assert.equal(activeNavHref(NAV_LINKS, "/dashboard"), "/dashboard");
});

test("unknown route highlights nothing", () => {
  assert.equal(activeNavHref(NAV_LINKS, "/login"), undefined);
});
