// Boot-time guards: production must not start with the default JWT secret,
// and non-production must not silently open the unauthenticated dev fallback.
// Run: node --import tsx --test test/server-boot.test.ts   (from apps/api)
import test from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_SECRET = process.env.JWT_SECRET;

function restore() {
  process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
}

test("buildServer throws in production with the default JWT secret", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.JWT_SECRET; // → falls back to the placeholder
  const { buildServer } = await import("../src/server.ts");
  assert.throws(() => buildServer(), /JWT_SECRET/);
  restore();
});

test("buildServer boots in production with a real JWT secret", async () => {
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "a-real-strong-secret-value";
  const { buildServer } = await import("../src/server.ts");
  const app = buildServer();
  assert.ok(app, "server built");
  await app.close();
  restore();
});

test("devAuthFallback is on only for explicit development", async () => {
  const { devAuthFallback } = await import("../src/env.ts");
  process.env.NODE_ENV = "development";
  assert.equal(devAuthFallback(), true);
  process.env.NODE_ENV = "production";
  assert.equal(devAuthFallback(), false);
  delete process.env.NODE_ENV; // unset → treated as non-dev (locked down)
  assert.equal(devAuthFallback(), false);
  process.env.NODE_ENV = "test";
  assert.equal(devAuthFallback(), false);
  restore();
});
