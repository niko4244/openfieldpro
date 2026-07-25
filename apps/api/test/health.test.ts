import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { buildServer } from "../src/server.js";
import { defaultHealthProbes } from "../src/health.js";

const passingProbes = {
  postgres: async () => {},
  uploads: async () => {},
  migrations: async () => {},
};

function postgresQuery(query: SQL) {
  return query.toQuery({
    casing: {} as never,
    escapeName: (name) => `"${name}"`,
    escapeParam: (index) => `$${index + 1}`,
    escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
  }).sql;
}

test("the default migration probe reads Drizzle's schema-qualified metadata table", async () => {
  const journal = JSON.parse(await readFile(new URL("../../../packages/db/drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
    entries: Array<{ when: number }>;
  };
  const probes = defaultHealthProbes({
    execute: async (query) => {
      const statement = postgresQuery(query);
      if (statement === "select created_at::text from \"drizzle\".\"__drizzle_migrations\"") {
        return journal.entries.map(({ when }) => ({ created_at: String(when) }));
      }
      throw new Error(`relation does not exist for ${statement}`);
    },
  });

  await probes.migrations();
});

test("liveness stays available while readiness reports a critical probe failure without leaking it", async () => {
  const sentinel = "postgres://user:sentinel-secret@private-host:5432/ofp C:\\private\\uploads";
  const app = buildServer({
    healthProbes: {
      ...passingProbes,
      postgres: async () => { throw new Error(sentinel); },
    },
  });

  const live = await app.inject({ method: "GET", url: "/api/health/live" });
  const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
  const legacy = await app.inject({ method: "GET", url: "/api/health" });

  assert.equal(live.statusCode, 200);
  assert.equal(JSON.parse(live.body).ok, true);
  assert.equal(ready.statusCode, 503);
  assert.equal(legacy.statusCode, 503);
  assert.deepEqual(JSON.parse(ready.body).components, {
    postgres: "failed",
    uploads: "ok",
    migrations: "ok",
    redis: "skipped",
  });
  assert.equal(ready.body.includes(sentinel), false);
  assert.equal(ready.body.includes("private-host"), false);
  assert.equal(ready.body.includes("C:\\private"), false);
  await app.close();
});

test("optional Redis is skipped, while a timed-out configured Redis probe fails readiness", async () => {
  const app = buildServer({ healthProbes: passingProbes, healthProbeTimeoutMs: 10 });
  const skipped = await app.inject({ method: "GET", url: "/api/health/ready" });
  assert.equal(skipped.statusCode, 200);
  assert.equal(JSON.parse(skipped.body).components.redis, "skipped");
  await app.close();

  const timedOut = buildServer({
    healthProbes: {
      ...passingProbes,
      redis: async () => await new Promise<void>(() => {}),
    },
    healthProbeTimeoutMs: 10,
  });
  const response = await timedOut.inject({ method: "GET", url: "/api/health/ready" });
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).components.redis, "failed");
  await timedOut.close();
});

test("timed-out readiness checks share unresolved probes and retry after they settle", async () => {
  let calls = 0;
  let resolveFirst!: () => void;
  const app = buildServer({
    healthProbes: {
      ...passingProbes,
      postgres: async () => {
        calls += 1;
        if (calls === 1) await new Promise<void>((resolve) => { resolveFirst = resolve; });
      },
    },
    healthProbeTimeoutMs: 10,
  });

  const [first, second] = await Promise.all([
    app.inject({ method: "GET", url: "/api/health/ready" }),
    app.inject({ method: "GET", url: "/api/health/ready" }),
  ]);
  assert.equal(first.statusCode, 503);
  assert.equal(second.statusCode, 503);
  assert.equal(calls, 1);

  resolveFirst();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const later = await app.inject({ method: "GET", url: "/api/health/ready" });
  assert.equal(later.statusCode, 200);
  assert.equal(calls, 2);
  await app.close();
});

test("health details require an owner and never serialize probe errors", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    jwtSecret: process.env.JWT_SECRET,
    corsOrigin: process.env.CORS_ORIGIN,
  };
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "health-test-secret-with-at-least-32-characters";
  process.env.CORS_ORIGIN = "https://example.test";

  const sentinel = "redis://user:details-secret@private-host:6379";
  const app = buildServer({
    healthProbes: {
      ...passingProbes,
      migrations: async () => { throw new Error(sentinel); },
    },
  });
  await app.ready();
  const dispatcherToken = app.jwt.sign({ userId: "dispatcher", orgId: "org", role: "dispatcher" });
  const ownerToken = app.jwt.sign({ userId: "owner", orgId: "org", role: "owner" });

  const anonymous = await app.inject({ method: "GET", url: "/api/health/details" });
  const dispatcher = await app.inject({
    method: "GET",
    url: "/api/health/details",
    headers: { authorization: `Bearer ${dispatcherToken}` },
  });
  const owner = await app.inject({
    method: "GET",
    url: "/api/health/details",
    headers: { authorization: `Bearer ${ownerToken}` },
  });

  assert.equal(anonymous.statusCode, 401);
  assert.equal(dispatcher.statusCode, 403);
  assert.equal(owner.statusCode, 503);
  assert.equal(owner.body.includes(sentinel), false);
  assert.equal(owner.body.includes("private-host"), false);
  await app.close();

  process.env.NODE_ENV = previous.nodeEnv;
  process.env.JWT_SECRET = previous.jwtSecret;
  process.env.CORS_ORIGIN = previous.corsOrigin;
});
