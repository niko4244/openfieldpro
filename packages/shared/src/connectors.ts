// Business-tier connector scaffolding (docs/PRO_FEATURES.md, docs/MONETIZATION.md).
// No OAuth flows or external API calls live here yet — this is the catalog +
// types so real connectors can be added later without a schema change.
// "generic-api" is the one entry that's already real: it's the existing
// scoped-token plugin API (apps/api/src/routes/plugin-api.ts), just listed
// here so Business buyers see it as part of what they're paying for.
import type { Plan } from "./index.js";

export type ConnectorStatus = "planned" | "beta" | "available";
export type ConnectorCategory = "accounting" | "automation" | "erp" | "payroll";

export interface ConnectorMeta {
  id: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  tierRequired: Plan;
  status: ConnectorStatus;
}

export const CONNECTORS: ConnectorMeta[] = [
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    description: "Sync invoices and payments to QuickBooks Online.",
    category: "accounting",
    tierRequired: "business",
    status: "planned",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Trigger Zaps from OpenFieldPro job, invoice, and payment events.",
    category: "automation",
    tierRequired: "business",
    status: "planned",
  },
  {
    id: "payroll-export",
    name: "Payroll export",
    description: "Export technician time entries in a payroll-ready format.",
    category: "payroll",
    tierRequired: "business",
    status: "planned",
  },
  {
    id: "generic-api",
    name: "REST API & webhooks",
    description: "Scoped API tokens and signed webhooks for custom ERP/API integrations — available today via the plugin portal.",
    category: "erp",
    tierRequired: "business",
    status: "available",
  },
];
