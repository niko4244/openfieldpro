// Minimal seed: one org, an owner, two customers, one scheduled job with an
// invoice. Enough to render a non-empty dashboard. Idempotent-ish: skips if an
// org named "Demo HVAC" already exists.
import { db, orgs, users, customers, properties, jobs, invoices, equipment, notifications, plugins } from "./index.js";
import { eq } from "drizzle-orm";
import { scryptSync, randomBytes } from "node:crypto";

// First-party plugin manifests (global catalog). Seeded idempotently by slug so
// the Integrations tab is populated on a fresh DB and refreshed on reseed. These
// describe what each plugin subscribes to and the scopes it requests — webhook
// URLs are supplied per-org at install time.
const NOTIFY_EVENTS = ["job.created", "invoice.created", "invoice.paid", "payment.received"];
const FIRST_PARTY_PLUGINS = [
  // Native notifiers — install, paste an incoming-webhook URL, get pinged. OFP
  // formats the message into the target's shape (no separate service needed).
  { slug: "slack-notifier", name: "Slack", description: "Post job, invoice, and payment alerts to a Slack channel.", events: NOTIFY_EVENTS, scopes: [], transform: "slack" },
  { slug: "discord-notifier", name: "Discord", description: "Post job, invoice, and payment alerts to a Discord channel.", events: NOTIFY_EVENTS, scopes: [], transform: "discord" },
  { slug: "ntfy-notifier", name: "ntfy", description: "Push job, invoice, and payment alerts to your phone via ntfy.", events: NOTIFY_EVENTS, scopes: [], transform: "ntfy" },
  // Generic plugins — receive the signed event envelope (build with @ofp/plugin-sdk).
  { slug: "google-maps", name: "Google Maps & Routing", description: "Geocode service addresses and optimize tech routes.", events: [], scopes: ["jobs:read", "customers:read"], transform: "generic" },
  { slug: "twilio-sms", name: "Twilio SMS", description: "Text customers on job and payment events.", events: ["job.created", "invoice.created", "payment.received"], scopes: ["jobs:read", "customers:read"], transform: "generic" },
  { slug: "resend-email", name: "Resend Email", description: "Send transactional email for invoices and estimates.", events: ["invoice.created", "estimate.accepted"], scopes: ["invoices:read", "customers:read"], transform: "generic" },
  { slug: "mailchimp", name: "Mailchimp", description: "Sync customers into a marketing audience.", events: ["customer.created"], scopes: ["customers:read"], transform: "generic" },
  { slug: "quickbooks", name: "QuickBooks Online", description: "Push paid invoices and payments into accounting.", events: ["invoice.paid", "payment.received"], scopes: ["invoices:read"], transform: "generic" },
  { slug: "zapier", name: "Zapier", description: "Fan every event out to thousands of apps.", events: ["job.created", "job.updated", "invoice.created", "invoice.paid", "payment.received", "customer.created", "estimate.accepted"], scopes: ["*"], transform: "generic" },
] as const;

async function seedPlugins(): Promise<void> {
  await db
    .insert(plugins)
    .values(FIRST_PARTY_PLUGINS.map((p) => ({ ...p, events: [...p.events], scopes: [...p.scopes], firstParty: true })))
    .onConflictDoNothing({ target: plugins.slug });
  console.log(`seed: ${FIRST_PARTY_PLUGINS.length} first-party plugin manifests ensured`);
}

// Inline password hash (same "saltHex:hashHex" scrypt format the API verifies)
// so the demo owner can log in with password "demo12345".
function seedHash(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

async function main() {
  // Plugin catalog is global and idempotent — seed it regardless of org state.
  await seedPlugins();

  const existing = await db.select().from(orgs).where(eq(orgs.name, "Demo HVAC"));
  if (existing.length) {
    console.log("seed: Demo HVAC already exists, skipping demo data");
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

    const [aliceHome] = await tx
      .insert(properties)
      .values({
        orgId: org.id,
        customerId: alice.id,
        address: "742 Maple St, Springfield, IL 62704",
        lat: "39.7817",
        lng: "-89.6501",
      })
      .returning();

    const [job] = await tx
      .insert(jobs)
      .values({
        orgId: org.id,
        customerId: alice.id,
        propertyId: aliceHome.id,
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

    // Demo equipment
    await tx.insert(equipment).values([
      {
        orgId: org.id, customerId: alice.id, type: "furnace",
        make: "Carrier", model: "59TP6A", serialNumber: "CRR-48291",
        installDate: new Date("2023-11-15"), warrantyExpiry: new Date("2033-11-15"),
      },
      {
        orgId: org.id, customerId: alice.id, type: "ac_unit",
        make: "Trane", model: "XV18", serialNumber: "TRN-73920",
        installDate: new Date("2024-06-01"), warrantyExpiry: new Date("2034-06-01"),
        notes: "Dual-stage compressor, uses R-410A",
      },
      {
        orgId: org.id, customerId: bob.id, type: "water_heater",
        make: "Rheem", model: "PROE50", serialNumber: "RHM-10482",
        installDate: new Date("2022-03-20"), warrantyExpiry: new Date("2032-03-20"),
      },
    ]);

    // Demo notification for the owner
    const [owner] = await tx.select().from(users).where(eq(users.orgId, org.id));
    await tx.insert(notifications).values({
      orgId: org.id,
      userId: owner.id,
      type: "job.scheduled",
      title: `Job "${job.title}" scheduled for Alice Johnson`,
      body: "AC tune-up scheduled for tomorrow. Please confirm with the customer.",
      link: `/jobs/${job.id}`,
    });

    console.log(`seed: created org ${org.id} with customers ${alice.id}, ${bob.id}`);
  });

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
