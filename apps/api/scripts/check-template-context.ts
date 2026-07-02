// Runnable check for buildTemplateContext: hydrates a real invoice.created
// envelope from the dev DB and asserts the merge context carries actual rows
// (customer via job, formatted money, real org name) — not PREVIEW_SAMPLE.
// Run: npx tsx scripts/check-template-context.ts   (from apps/api)
import assert from "node:assert";
import { db, invoices } from "@ofp/db";
import { buildTemplateContext } from "../src/lib/events.js";

const [inv] = await db.select().from(invoices).limit(1);
assert(inv, "no invoice in dev DB — run pnpm db:seed first");

const ctx = await buildTemplateContext({
  orgId: inv.orgId,
  key: "invoice.created",
  occurredAt: new Date().toISOString(),
  payload: { id: inv.id, number: inv.number, jobId: inv.jobId, total: inv.total },
});

assert.equal(ctx.invoice?.number, inv.number, "invoice hydrated by id");
assert(String(ctx.invoice?.total).startsWith("$"), "invoice total money-formatted");
assert(ctx.job?.title, "job hydrated via invoice.jobId");
assert(ctx.customer?.name, "customer hydrated via job.customerId");
assert(ctx.org?.name && ctx.org.name !== "Acme HVAC", "real org name, not the preview sample");

console.log("ok — hydrated context:", JSON.stringify(ctx));
process.exit(0);
