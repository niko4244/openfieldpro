import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db, estimates, jobs } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { mintApprovalToken, buildApprovalLink } from "../approval.js";

const createBody = z.object({ jobId: z.string().uuid() });

// Bounded retry on a UNIQUE_VIOLATION when allocating a 64-char hex token.
// A true collision is astronomical (64-hex entropy ≈ 2^256); 5 attempts is
// generous insurance before we'd rather 500.
const MAX_TOKEN_ALLOC = 5;

export async function estimateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db
      .select()
      .from(estimates)
      .where(eq(estimates.orgId, orgId))
      .orderBy(desc(estimates.createdAt))
      .limit(t)
      .offset(s);
  });

  // Create an estimate snapshotting the current job total.
  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });
    const [row] = await db
      .insert(estimates)
      .values({ orgId, jobId: job.id, total: job.total })
      .returning();
    return reply.code(201).send(row);
  });

  // Accept an estimate → moves the job from lead to scheduled (ready to dispatch).
  app.post("/:id/accept", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [est] = await db
      .update(estimates)
      .set({ accepted: true })
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)))
      .returning();
    if (!est) return reply.code(404).send({ error: "not found" });
    await db.update(jobs).set({ status: "scheduled" }).where(eq(jobs.id, est.jobId));
    return { ...est, jobStatus: "scheduled" };
  });

  // ── Phase 6: send-for-customer-approval ──
  //
  // Mints a magic link the operator copies into email/SMS. Idempotent:
  // re-clicking Send returns the existing token (we don't rotate; doing
  // so would silently break a link already in the customer's inbox).
  // Refuses to mint a link on an already-accepted estimate — clicking
  // Send on something the customer already signed is almost certainly
  // a stale tab.
  app.post("/:id/send", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    // Resolve the link base UP-FRONT. We deliberately do NOT trust inbound
    // Host / X-Forwarded-Proto for link generation — an attacker who can
    // forge the Host header could otherwise poison the link. Operators must
    // set PUBLIC_BASE_URL in their environment; we surface 503 otherwise.
    const envUrl = process.env.PUBLIC_BASE_URL?.trim();
    if (!envUrl) {
      app.log.warn({ estimateId: id }, "send-without-public-base-url");
      return reply.code(503).send({
        error: "PUBLIC_BASE_URL is not configured; cannot mint approval link",
      });
    }

    const [est] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.orgId, orgId), eq(estimates.id, id)));
    if (!est) return reply.code(404).send({ error: "not found" });
    if (est.accepted) {
      return reply.code(400).send({
        error: "Estimate already accepted; create a new estimate to re-send.",
      });
    }

    // Idempotent branch: a token already exists → reuse it. No update needed
    // beyond refreshing `sent_at` so the UI shows when "Send" was last clicked.
    const sentAt = new Date();
    const token = est.approvalToken ?? (await resolveApprovalToken(app, id, sentAt));
    if (!token) {
      // 5 collisions + no concurrent winner found on re-read is structurally
      // impossible on 64-hex entropy; surface a 500 so an operator notices.
      return reply.code(500).send({ error: "Could not allocate approval token" });
    }
    if (est.approvalToken) {
      // Refresh sent_at when reusing an existing token.
      await db
        .update(estimates)
        .set({ approvalTokenSentAt: sentAt })
        .where(eq(estimates.id, id));
    }

    return {
      approvalLink: buildApprovalLink(envUrl, token),
      sentAt: sentAt.getTime(),
    };
  });
}

// Mint + write an approval token with bounded retries on UNIQUE_VIOLATION,
// breaking early on the first successful UPDATE so the happy path costs one
// round-trip. On exit, always re-read the row so that if a CONCURRENT writer
// raced us (their UPDATE matched our conditional WHERE's row count to 0
// without throwing 23505), we still return their token — no spurious 500s
// from a genuine race. The name reflects that we now RESOLVE a token (ours
// or a winner's) rather than purely allocate one. The caller treats a null
// return as a 500 only when crossing MAX_TOKEN_ALLOC collisions AND no
// concurrent token exists, which on 64-hex entropy is structurally
// impossible.
async function resolveApprovalToken(
  app: FastifyInstance,
  estimateId: string,
  sentAt: Date,
): Promise<string | null> {
  for (let i = 0; i < MAX_TOKEN_ALLOC; i++) {
    const candidate = mintApprovalToken();
    try {
      // Returning the column gives us a type-safe success signal — rows.length
      // is the affected-row count under any Drizzle driver version. Avoids
      // casting the driver-specific QueryResult shape for rowCount.
      const rows = await db
        .update(estimates)
        .set({ approvalToken: candidate, approvalTokenSentAt: sentAt })
        .where(and(eq(estimates.id, estimateId), isNull(estimates.approvalToken)))
        .returning({ token: estimates.approvalToken });
      if (rows.length > 0) return rows[0].token;
      // Matched-zero on this attempt: a concurrent /send committed first.
      // Fall through to the post-loop re-read to pick their token up.
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      // Persist telemetry: a 23505 here is a structural anomaly (entropy is
      // 2^256 per attempt), so any hit is worth knowing about post-hoc.
      app.log.warn(
        { estimateId, attempt: i + 1, max: MAX_TOKEN_ALLOC },
        "approval-token-collision-retry",
      );
    }
  }
  // Pick up the winner's token if a concurrent /send committed during our
  // attempts; otherwise return null and let the caller 500.
  const [row] = await db
    .select({ token: estimates.approvalToken })
    .from(estimates)
    .where(eq(estimates.id, estimateId))
    .limit(1);
  return row?.token ?? null;
}
