// Industry & AI workflow-pack scaffolding. Metadata/config only — packs are
// bundles of templates, checklists, forms, automations, and prompts that
// unlock with the industryPacks / aiWorkflowPacks feature flags. Content
// ships later as static config; nothing here requires a server.
import type { Plan } from "./index.js";

export type PackKind = "industry" | "ai";

export interface WorkflowPackMeta {
  id: string;
  kind: PackKind;
  name: string;
  description: string;
  tierRequired: Plan;
  /** What the pack will contain when its content ships. */
  contents: string[];
}

const INDUSTRY_CONTENTS = ["job templates", "inspection checklists", "line-item presets", "customer comms templates"];

export const WORKFLOW_PACKS: WorkflowPackMeta[] = [
  { id: "appliance", kind: "industry", name: "Appliance Repair", description: "Appliance service workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "hvac", kind: "industry", name: "HVAC", description: "Heating & cooling workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "plumbing", kind: "industry", name: "Plumbing", description: "Plumbing service workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "electrical", kind: "industry", name: "Electrical", description: "Electrical service workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "garage-doors", kind: "industry", name: "Garage Doors", description: "Garage-door service workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "pest-control", kind: "industry", name: "Pest Control", description: "Pest-control workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "cleaning", kind: "industry", name: "Cleaning", description: "Residential/commercial cleaning workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  { id: "locksmith", kind: "industry", name: "Locksmith", description: "Locksmith service workflows.", tierRequired: "pro", contents: INDUSTRY_CONTENTS },
  {
    id: "ai-core",
    kind: "ai",
    name: "AI Workflow Pack",
    description: "Prompts, automations, inspection templates, diagnostic scripts, and customer-communication templates.",
    tierRequired: "pro",
    contents: ["prompts", "automations", "inspection templates", "forms", "checklists", "diagnostic scripts", "customer communication templates"],
  },
];
