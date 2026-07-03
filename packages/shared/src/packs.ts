// Industry & AI workflow packs. Metadata + real starter content: catalog
// (price book) line-item presets and customer-communication templates install
// into tables that already exist (catalog_items, templates) via
// POST /api/packs/:id/install; checklists/diagnostics ship as reference text
// since there's no dedicated checklist table yet (see PRO_FEATURES.md).
import type { Plan } from "./index.js";

export type PackKind = "industry" | "ai";

/** A price-book line seeded into catalog_items on install. */
export interface PackCatalogItem {
  name: string;
  description: string;
  priceCents: number;
  costCents: number;
}

/** A notification template seeded into templates on install. Keys are
 * namespaced `pack.<packId>.<slug>` so they never collide with the core
 * event-driven TEMPLATE_KEYS or another pack's keys. */
export interface PackTemplate {
  key: string;
  channel: "email" | "sms";
  name: string;
  subject: string | null;
  body: string;
}

export interface WorkflowPackMeta {
  id: string;
  kind: PackKind;
  name: string;
  description: string;
  tierRequired: Plan;
  catalogItems: PackCatalogItem[];
  templates: PackTemplate[];
  /** Reference-only content (inspection checklists, diagnostic steps,
   * automation ideas). Not installed into any table yet. */
  checklists: string[];
}

function commsTemplate(packId: string, greeting: string, body: string): PackTemplate {
  return {
    key: `pack.${packId}.follow_up`,
    channel: "email",
    name: "Follow-up (from pack)",
    subject: `A quick note from {{org.name}}`,
    body: `Hi {{customer.name}},\n\n${greeting}\n\n${body}\n\nThank you,\n{{org.name}}`,
  };
}

export const WORKFLOW_PACKS: WorkflowPackMeta[] = [
  {
    id: "appliance",
    kind: "industry",
    name: "Appliance Repair",
    description: "Appliance service workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Diagnostic visit", description: "In-home diagnostic, waived if repair booked.", priceCents: 8900, costCents: 0 },
      { name: "Appliance repair — labor (1 hr)", description: "Standard labor rate.", priceCents: 12500, costCents: 4000 },
    ],
    templates: [commsTemplate("appliance", "thanks for having us out to look at your appliance.", "Let us know if it's running well, or if you'd like to schedule the recommended repair.")],
    checklists: ["Verify model/serial number", "Check power supply and connections", "Test cycle end-to-end", "Photograph any leaks or corrosion"],
  },
  {
    id: "hvac",
    kind: "industry",
    name: "HVAC",
    description: "Heating & cooling workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "AC tune-up", description: "Seasonal maintenance and inspection.", priceCents: 14900, costCents: 3500 },
      { name: "Refrigerant recharge (per lb)", description: "R-410A, labor included.", priceCents: 9500, costCents: 4200 },
    ],
    templates: [commsTemplate("hvac", "thanks for choosing us for your heating/cooling needs.", "A seasonal tune-up now can help avoid a breakdown during peak season — reply if you'd like to schedule one.")],
    checklists: ["Check refrigerant pressure", "Inspect ductwork for leaks", "Clean condenser coils", "Test thermostat calibration", "Verify filter condition"],
  },
  {
    id: "plumbing",
    kind: "industry",
    name: "Plumbing",
    description: "Plumbing service workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Drain cleaning", description: "Standard drain snake service.", priceCents: 11900, costCents: 2500 },
      { name: "Water heater flush", description: "Sediment flush and inspection.", priceCents: 9900, costCents: 2000 },
    ],
    templates: [commsTemplate("plumbing", "thanks for calling us for your plumbing needs.", "If you noticed any slow drains elsewhere in the home, let us know — we're happy to take a look next visit.")],
    checklists: ["Check for visible leaks under fixtures", "Test water pressure", "Inspect shutoff valves", "Verify water heater temperature setting"],
  },
  {
    id: "electrical",
    kind: "industry",
    name: "Electrical",
    description: "Electrical service workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Electrical safety inspection", description: "Panel, outlets, and GFCI check.", priceCents: 12900, costCents: 3000 },
      { name: "Outlet/switch replacement", description: "Per fixture, standard grade.", priceCents: 6500, costCents: 1500 },
    ],
    templates: [commsTemplate("electrical", "thanks for trusting us with your electrical work.", "Your panel and outlets are all set — reach out if you notice any flickering or tripped breakers.")],
    checklists: ["Test GFCI/AFCI trip function", "Check panel for double-taps", "Verify grounding", "Inspect for overloaded circuits"],
  },
  {
    id: "garage-doors",
    kind: "industry",
    name: "Garage Doors",
    description: "Garage-door service workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Garage door tune-up", description: "Spring, track, and opener inspection.", priceCents: 8900, costCents: 2000 },
      { name: "Torsion spring replacement", description: "Per spring, standard size.", priceCents: 19900, costCents: 6000 },
    ],
    templates: [commsTemplate("garage-doors", "thanks for having us service your garage door.", "The door should be running smoothly now — let us know if you hear any new noises.")],
    checklists: ["Check spring balance", "Inspect cables and pulleys", "Test auto-reverse safety sensors", "Lubricate rollers and hinges"],
  },
  {
    id: "pest-control",
    kind: "industry",
    name: "Pest Control",
    description: "Pest-control workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Initial pest treatment", description: "Interior + exterior perimeter treatment.", priceCents: 14900, costCents: 3000 },
      { name: "Quarterly maintenance visit", description: "Recurring service, existing customers.", priceCents: 8900, costCents: 1500 },
    ],
    templates: [commsTemplate("pest-control", "thanks for choosing us for pest control.", "Your next quarterly visit will help keep things under control — let us know if you spot activity before then.")],
    checklists: ["Inspect entry points and foundation", "Check for nesting/activity signs", "Apply treatment per label instructions", "Document areas treated"],
  },
  {
    id: "cleaning",
    kind: "industry",
    name: "Cleaning",
    description: "Residential/commercial cleaning workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Standard home cleaning", description: "Per visit, up to 2,000 sq ft.", priceCents: 12900, costCents: 4000 },
      { name: "Deep clean add-on", description: "Baseboards, inside appliances, windows.", priceCents: 7900, costCents: 2500 },
    ],
    templates: [commsTemplate("cleaning", "thanks for having us clean your space.", "We hope everything looks great! Let us know if anything needs a second pass.")],
    checklists: ["Confirm access/key arrangements", "Note any fragile or off-limits items", "Walk through with customer if requested"],
  },
  {
    id: "locksmith",
    kind: "industry",
    name: "Locksmith",
    description: "Locksmith service workflows.",
    tierRequired: "pro",
    catalogItems: [
      { name: "Lock rekey (per lock)", description: "Standard residential rekey.", priceCents: 4900, costCents: 1200 },
      { name: "Lockout service", description: "Non-destructive entry.", priceCents: 8900, costCents: 1000 },
    ],
    templates: [commsTemplate("locksmith", "thanks for calling us for your lock/security needs.", "Your new keys are ready — let us know if you'd like extras cut.")],
    checklists: ["Verify ID/ownership before entry", "Test all keys on-site", "Confirm deadbolt alignment"],
  },
  {
    id: "ai-core",
    kind: "ai",
    name: "AI Workflow Pack",
    description: "Prompts, automations, inspection templates, and customer-communication templates.",
    tierRequired: "pro",
    catalogItems: [],
    templates: [
      {
        key: "pack.ai-core.diagnostic_summary",
        channel: "email",
        name: "AI diagnostic summary (from pack)",
        subject: "Your service visit summary — {{job.title}}",
        body: `Hi {{customer.name}},\n\nHere's a quick summary of today's visit for {{job.title}}:\n\n{{job.status}}\n\nIf you have any questions about what we found or recommended, just reply to this email.\n\nThank you,\n{{org.name}}`,
      },
    ],
    checklists: [
      "Prompt: \"Summarize this job's notes into a 3-sentence customer-facing update.\"",
      "Prompt: \"Draft a polite follow-up for a customer who hasn't responded to an estimate in 5 days.\"",
      "Automation idea: auto-request a review 2 hours after a job is marked completed.",
      "Automation idea: flag jobs with no line items 24h after being marked completed.",
      "Diagnostic script: ask the customer for symptom onset, frequency, and any error codes before dispatch.",
    ],
  },
];
