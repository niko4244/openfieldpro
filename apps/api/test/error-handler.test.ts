// Global error/not-found handlers: a malformed id must become a clean 400
// (not a 500 that leaks the Postgres "invalid input syntax for type uuid"
// message), and an unknown route must be a JSON 404. Uses app.inject() against
// the local dev DB (no network listener). Requires Postgres up on DATABASE_URL.
// Run: node --import tsx --test test/error-handler.test.ts   (from apps/api)
import test from "node:test";
import assert from "node:assert/strict";

// Public routes need no auth, but buildServer's JWT guard requires a real
// secret unless we're non-production. Opt into development for this file.
process.env.NODE_ENV = "development";

const { buildServer } = await import("../src/server.ts");
const { closeDb } = await import("@ofp/db");
const app = buildServer();

test.after(async () => {
  await app.close();
  await closeDb(); // release the pg pool so the test process can exit
});

test("malformed id → 400 with a sanitized body (not a 500 leak)", async () => {
  const res = await app.inject({ method: "GET", url: "/api/public/not-a-uuid" });
  assert.equal(res.statusCode, 400);
  const body = res.json() as { error?: string };
  assert.equal(body.error, "bad request");
  // The internal Postgres message must not reach the client.
  assert.ok(!res.body.includes("invalid input syntax"), "no DB detail leaked");
  assert.ok(!res.body.includes("22P02"), "no SQLSTATE leaked");
});

test("unknown route → JSON 404 (not an HTML/text default)", async () => {
  const res = await app.inject({ method: "GET", url: "/api/definitely-not-a-route" });
  assert.equal(res.statusCode, 404);
  const body = res.json() as { error?: string };
  assert.equal(body.error, "not found");
});

test("malformed body on a validated route → 400, not 500", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/public/00000000-0000-0000-0000-000000000000/book",
    payload: { name: "" }, // fails zod (name min 1, title required)
    headers: { "content-type": "application/json" },
  });
  assert.equal(res.statusCode, 400);
});
