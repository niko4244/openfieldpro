// Minimal seed: one org, an owner, two customers, one scheduled job with an
// invoice. Enough to render a non-empty dashboard. Idempotent-ish: skips if an
// org named "Demo HVAC" already exists.
import { db, orgs, users, customers, jobs, invoices } from "./index.js";
import { eq } from "drizzle-orm";
import { scryptSync, randomBytes } from "node:crypto";

// Inline password hash (same "saltHex:hashHex" scrypt format the API verifies)
// so the demo owner can log in with password "demo12345".
function seedHash(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

async function main() {
  const existing = await db.select().from(orgs).where(eq(orgs.name, "Demo HVAC"));
  if (existing.length) {
    console.log("seed: Demo HVAC already exists, skipping");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    const [org] = await tx.insert(orgs).values({ name: "Demo HVAC" }).returning();
    await tx.insert(users).values({
      orgId: org.id,
      email: "owner@demo.test",
      name: "Dana Owner",
      role: "owner",
      passwordHash: seedHash("demo12345"),
    });

    const [alice, bob] = await tx
      .insert(customers)
      .values([
        { orgId: org.id, name: "Alice Johnson", email: "alice@example.com", phone: "555-0101" },
        { orgId: org.id, name: "Bob Smith", phone: "555-0102" },
      ])
      .returning();

    const [job] = await tx
      .insert(jobs)
      .values({
        orgId: org.id,
        customerId: alice.id,
        title: "AC tune-up",
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 86_400_000),
        total: 18900,
      })
      .returning();

    await tx.insert(invoices).values({
      orgId: org.id,
      jobId: job.id,
      number: "INV-1001",
      status: "sent",
      total: 18900,
    });

    console.log(`seed: created org ${org.id} with customers ${alice.id}, ${bob.id}`);
  });

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
