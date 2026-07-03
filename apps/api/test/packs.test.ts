// Industry/AI pack listing + install. Uses app.inject() against the local
// dev DB (creates and tears down its own org). Requires Postgres up on
// DATABASE_URL. Run: node --import tsx --test test/packs.test.ts (from apps/api)
import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "development"; // enables the x-org-id dev auth fallback

const { buildServer } = await import("../src/server.ts");
const { db, orgs, closeDb } = await import("@ofp/db");
const { eq } = await import("drizzle-orm");

const app = buildServer();
const [org] = await db.insert(orgs).values({ name: "Packs Test Org" }).returning();
const orgId = org.id;

test.after(async () => {
  await db.delete(orgs).where(eq(orgs.id, orgId)); // cascades catalog/templates
  await app.close();
  await closeDb();
});

function headers() {
  return { "x-org-id": orgId };
}

test("GET /api/packs lists all packs, locked on Free", async () => {
  const res = await app.inject({ method: "GET", url: "/api/packs", headers: headers() });
  assert.equal(res.statusCode, 200);
  const packs = res.json() as Array<{ id: string; planSatisfied: boolean; installed: boolean }>;
  assert.ok(packs.length >= 9); // 8 industry + 1 AI
  assert.ok(packs.every((p) => p.planSatisfied === false), "Free satisfies no pack");
  assert.ok(packs.every((p) => p.installed === false), "nothing installed yet");
});

test("POST /api/packs/:id/install is blocked on Free (402)", async () => {
  const res = await app.inject({ method: "POST", url: "/api/packs/hvac/install", headers: headers() });
  assert.equal(res.statusCode, 402);
  const body = res.json() as { requiredPlan?: string };
  assert.equal(body.requiredPlan, "pro");
});

test("unknown pack id → 404", async () => {
  const res = await app.inject({ method: "POST", url: "/api/packs/not-a-pack/install", headers: headers() });
  assert.equal(res.statusCode, 404);
});

test("install seeds catalog items + templates once Pro, and is idempotent", async () => {
  await db.update(orgs).set({ plan: "pro" }).where(eq(orgs.id, orgId));

  const first = await app.inject({ method: "POST", url: "/api/packs/hvac/install", headers: headers() });
  assert.equal(first.statusCode, 201);
  const firstBody = first.json() as { installedCatalogItems: unknown[]; installedTemplates: unknown[] };
  assert.equal(firstBody.installedCatalogItems.length, 2);
  assert.equal(firstBody.installedTemplates.length, 1);

  // Second install: everything already exists, so nothing new is inserted.
  const second = await app.inject({ method: "POST", url: "/api/packs/hvac/install", headers: headers() });
  assert.equal(second.statusCode, 201);
  const secondBody = second.json() as { installedCatalogItems: unknown[]; installedTemplates: unknown[] };
  assert.equal(secondBody.installedCatalogItems.length, 0);
  assert.equal(secondBody.installedTemplates.length, 0);

  const list = await app.inject({ method: "GET", url: "/api/packs", headers: headers() });
  const packs = list.json() as Array<{ id: string; installed: boolean; planSatisfied: boolean }>;
  const hvac = packs.find((p) => p.id === "hvac")!;
  assert.equal(hvac.installed, true);
  assert.equal(hvac.planSatisfied, true);
  // A different pro-gated pack that was never installed still shows false.
  const plumbing = packs.find((p) => p.id === "plumbing")!;
  assert.equal(plumbing.installed, false);
});

test("GET /api/connectors reflects plan gating", async () => {
  await db.update(orgs).set({ plan: "free" }).where(eq(orgs.id, orgId));
  const free = await app.inject({ method: "GET", url: "/api/connectors", headers: headers() });
  assert.equal(free.statusCode, 200);
  const freeList = free.json() as Array<{ id: string; planSatisfied: boolean }>;
  assert.ok(freeList.every((c) => c.planSatisfied === false));

  await db.update(orgs).set({ plan: "business" }).where(eq(orgs.id, orgId));
  const biz = await app.inject({ method: "GET", url: "/api/connectors", headers: headers() });
  const bizList = biz.json() as Array<{ id: string; planSatisfied: boolean }>;
  assert.ok(bizList.every((c) => c.planSatisfied === true));
});
