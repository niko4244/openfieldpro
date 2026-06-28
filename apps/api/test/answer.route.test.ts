import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Mock classify module so the 502 test doesn't depend on Ollama being down.
// Must be top-level so ESM cache uses it before any import() resolves.
mock.module("../src/answer/prompts/classify.js", {
  namedExports: {
    async classify() {
      throw new Error("Ollama unreachable (test mock)");
    },
  },
});

describe("POST /api/answer", () => {
  it("returns 400 for empty prompt", async () => {
    const { answerRoutes } = await import("../src/routes/answer.js");
    const { default: Fastify } = await import("fastify");
    const app = Fastify();
    await app.register(answerRoutes, { prefix: "/api" });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/api/answer", body: {} });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.error);

    await app.close();
  });

  it("returns 400 for missing body", async () => {
    const { answerRoutes } = await import("../src/routes/answer.js");
    const { default: Fastify } = await import("fastify");
    const app = Fastify();
    await app.register(answerRoutes, { prefix: "/api" });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/api/answer" });
    assert.equal(res.statusCode, 400);

    await app.close();
  });

  it("returns 502 when classify throws (Ollama unreachable)", async () => {
    const { answerRoutes } = await import("../src/routes/answer.js");
    const { default: Fastify } = await import("fastify");
    const app = Fastify();
    await app.register(answerRoutes, { prefix: "/api" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/answer",
      body: { prompt: "Hello" },
    });
    // Mock.classify throws → handler catches → 502
    assert.equal(res.statusCode, 502);
    const body = JSON.parse(res.payload);
    assert.equal(body.ok, false);
    assert.equal(body.error, "classification failed");

    await app.close();
  });
});
