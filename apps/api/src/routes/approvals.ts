import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, estimates, jobs, lineItems, customers, orgs } from "@ofp/db";
import { isValidSignatureDataUrl, normalizeSignerName } from "../approval.js";

// PUBLIC route — NO JWT. The token in the URL is the auth.
//
// Rate-limiting / abuse belongs in front (Caddy or a future Redis-backed
// limiter). V1 trusts the cryptographic strength of the 64-char hex token.

const approveBody = z.object({
  signerName: z.string().min(1).max(120),
  signatureData: z.string().min(1).max(100_000),
});

// Real mints are 64 hex chars (32 bytes of entropy in mintApprovalToken);
// we accept 32+ as a defensive floor so a single typo slips to 404, not into
// the table. Anything shorter than 32 is structurally not one of ours.
const MIN_TOKEN_LEN = 32;

function findEstimateByToken(token: string) {
  // Drizzle's `eq` against `approvalToken` is index-friendly (partial unique
  // index at the DB level). A bad token returns no row → 404 to the caller.
  return db
    .select()
    .from(estimates)
    .where(eq(estimates.approvalToken, token))
    .limit(1);
}

export async function approvalRoutes(app: FastifyInstance) {
  // ── Fetch the approval payload (read-only, public) ──
  //
  // Single round-trip with inner joins. Customer comes via jobs (estimate →
  // job → customer); org comes from estimate.orgId; lineItems are part of
  // the job, fetched in a second small query (no cross-table scan needed).
  app.get("/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!token || token.length < MIN_TOKEN_LEN) {
      return reply.code(404).send({ error: "invalid link" });
    }

    // Estimate + Job + Customer in one shot (org wired separately below).
    const rows = await db
      .select({
        estimateId: estimates.id,
        estimateTotal: estimates.total,
        estimateAccepted: estimates.accepted,
        estimateSignedAt: estimates.signedAt,
        estimateSignedBy: estimates.signedBy,
        estimateCreatedAt: estimates.createdAt,
        orgId: estimates.orgId,
        jobId: jobs.id,
        jobTitle: jobs.title,
        jobDescription: jobs.description,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(estimates)
      .innerJoin(jobs, eq(jobs.id, estimates.jobId))
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(eq(estimates.approvalToken, token))
      .limit(1);
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: "invalid or expired link" });

    const [org] = await db
      .select({ id: orgs.id, name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, row.orgId));

    const items = await db
      .select({
        id: lineItems.id,
        description: lineItems.description,
        quantity: lineItems.quantity,
        unitPrice: lineItems.unitPrice,
      })
      .from(lineItems)
      .where(and(eq(lineItems.jobId, row.jobId), eq(lineItems.orgId, row.orgId)));

    return {
      estimate: {
        id: row.estimateId,
        total: row.estimateTotal,
        accepted: row.estimateAccepted,
        signedAt: row.estimateSignedAt ? row.estimateSignedAt.toISOString() : null,
        signedBy: row.estimateSignedBy,
        createdAt: row.estimateCreatedAt.toISOString(),
      },
      job: { id: row.jobId, title: row.jobTitle, description: row.jobDescription },
      customer: {
        name: row.customerName,
        email: row.customerEmail,
        phone: row.customerPhone,
      },
      org: org ?? { id: row.orgId, name: "" },
      lineItems: items,
    };
  });

  // ── Submit signature + accept ──
  //
  // First-signer-wins via an atomic conditional update. The WHERE guard
  // (accepted = false) means only the FIRST writer's signature sticks;
  // concurrent submitters get alreadyAccepted=true and read back the winning
  // record. No lost-update race, no fragile application-level check.
  app.post("/:token/approve", async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!token || token.length < MIN_TOKEN_LEN) {
      return reply.code(404).send({ error: "invalid link" });
    }
    const parsed = approveBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (!isValidSignatureDataUrl(parsed.data.signatureData)) {
      return reply.code(400).send({
        error: "Signature payload must be a data:image/png;base64,... URI",
      });
    }
    const signer = normalizeSignerName(parsed.data.signerName);
    if (!signer) {
      return reply.code(400).send({ error: "signerName required" });
    }

    const [est] = await findEstimateByToken(token);
    if (!est) return reply.code(404).send({ error: "invalid or expired link" });

    const now = new Date();
    const [winner] = await db
      .update(estimates)
      .set({
        accepted: true,
        signatureData: parsed.data.signatureData,
        signedAt: now,
        signedBy: signer,
      })
      .where(and(eq(estimates.id, est.id), eq(estimates.accepted, false)))
      .returning();
    const won = !!winner;

    // Idempotency on the job side too: only advance `lead → scheduled`.
    // Once the job is past `lead`, leave it alone (e.g. an in-progress job
    // shouldn't get bounced back to scheduled by a typo'd re-approve click).
    if (won) {
      await db
        .update(jobs)
        .set({ status: "scheduled" })
        .where(and(eq(jobs.id, est.jobId), eq(jobs.status, "lead")));
    }

    // Lose path: re-read signedAt/signedBy from the DB. Without this, two
    // concurrent POSTs that interleave around our initial SELECT could
    // report the OLD (null) signedAt instead of the winner's snapshot.
    // We trust the fresh row's nullable truth — no `??` fallback — so a
    // signature-less accept (via POST /api/estimates/:id/accept) reports
    // signedBy=null rather than leaking the loser's signer name.
    let reportSignedAt: Date | null = now;
    let reportSignedBy: string | null = signer;
    if (!won) {
      const [fresh] = await db
        .select({
          signedAt: estimates.signedAt,
          signedBy: estimates.signedBy,
        })
        .from(estimates)
        .where(eq(estimates.id, est.id))
        .limit(1);
      if (fresh) {
        reportSignedAt = fresh.signedAt;
        reportSignedBy = fresh.signedBy;
      }
    }

    return {
      ok: true,
      alreadyAccepted: !won,
      accepted: true,
      signedAt: reportSignedAt ? reportSignedAt.toISOString() : null,
      signedBy: reportSignedBy,
    };
  });
}

// ponytail: chained `.innerJoin()` calls — the eq() argument tells Drizzle
//   the join target, so we don't need a named `innerJoin` import here.
//   Ceiling: if the public payload grows (multiple inspections, photos,
//   technician), split the GET into two endpoints (summary + full) so the
//   page can fast-render the summary then lazy-load details above the fold.
