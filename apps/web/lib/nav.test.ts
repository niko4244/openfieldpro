import assert from "node:assert/strict";
import test from "node:test";
import { activeNavHref, navSectionsForRole } from "./nav";

function hrefs(role?: string | null) {
  return navSectionsForRole(role).flatMap((section) => section.links.map((link) => link.href));
}

test("owners retain the full operations and administration navigation", () => {
  const owner = hrefs("owner");
  for (const path of [
    "/jobs/new",
    "/dispatch",
    "/estimates",
    "/invoices",
    "/diagnostic-library",
    "/coverage",
    "/reports",
    "/integrations",
    "/settings",
  ]) {
    assert.equal(owner.includes(path), true, `expected owner navigation to include ${path}`);
  }
});

test("dispatchers retain office operations but not owner administration", () => {
  const dispatcher = hrefs("dispatcher");
  assert.equal(dispatcher.includes("/jobs/new"), true);
  assert.equal(dispatcher.includes("/dispatch"), true);
  assert.equal(dispatcher.includes("/invoices"), true);
  assert.equal(dispatcher.includes("/reports"), true);
  assert.equal(dispatcher.includes("/integrations"), false);
  assert.equal(dispatcher.includes("/settings"), false);
});

test("technicians receive only assigned field-work destinations", () => {
  assert.deepEqual(hrefs("technician"), [
    "/",
    "/jobs",
    "/closeout",
    "/customers",
    "/price-book",
  ]);
});

test("unknown and unauthenticated roles receive no private navigation", () => {
  assert.deepEqual(hrefs(undefined), []);
  assert.deepEqual(hrefs(null), []);
  assert.deepEqual(hrefs("unexpected"), []);
});

test("active route matching respects the filtered role navigation", () => {
  const technicianSections = navSectionsForRole("technician");
  assert.equal(activeNavHref("/jobs/job-1", technicianSections), "/jobs");
  assert.equal(activeNavHref("/invoices/invoice-1", technicianSections), null);
});
