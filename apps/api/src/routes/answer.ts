import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { classify, type ClassifyIntent } from "../answer/prompts/classify.js";

const answerBody = z.object({
  prompt: z.string().min(1).max(4000),
});

export async function answerRoutes(app: FastifyInstance) {
  // POST /api/answer — classify a user's free-text prompt
  app.post("/answer", async (req, reply) => {
    // Auth is optional — the conductor accepts unauthenticated prompts
    // (the downstream skill invocation gates on auth, not classification).
    const parsed = answerBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { prompt } = parsed.data;

    try {
      const result = await classify(prompt);
      return reply.send({
        ok: true,
        intent: result.intent,
        confidence: result.confidence,
        rationale: result.rationale,
        hedge: result.hedge,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      req.log.error({ err, prompt }, "answer classification failed");
      return reply.code(502).send({ ok: false, error: "classification failed", message });
    }
  });
}
