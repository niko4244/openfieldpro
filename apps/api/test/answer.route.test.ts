import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { answerRoutes } from "../src/routes/answer.js";

describe("POST /api/answer", () => {
  it("returns 400 for empty prompt", async () => {
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
    const app = Fastify();
    await app.register(answerRoutes, { prefix: "/api" });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/api/answer" });
    assert.equal(res.statusCode, 400);

    await app.close();
  });

  it("returns 502 when classify throws (Ollama unreachable)", async () => {
    const app = Fastify();
    await app.register(answerRoutes, { prefix: "/api" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/answer",
      body: { prompt: "Hello" },
    });
    // In test, no Ollama running — should 502, not crash
    assert.equal(res.statusCode, 502);
    const body = JSON.parse(res.payload);
    assert.equal(body.ok, false);
    assert.equal(body.error, "classification failed");

    await app.close();
  });
});
