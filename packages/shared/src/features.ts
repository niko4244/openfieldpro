// Centralized feature gating for the open-core tiers.
//
// Every core FSM capability (scheduling, dispatch, invoicing, customers,
// jobs, reports, mobile, sync, unlimited everything) is ALWAYS on and never
// appears here — only premium polish/convenience is flag-gated. A missing,
// invalid, or expired license resolves to "free": features switch off but no
// data is ever hidden or deleted.
import type { Plan } from "./index.js";

export interface FeatureFlags {
  /** Hide the dashboard sponsor card (pro+). */
  removeSponsorSlot: boolean;
  /** Company logo/color/footer on customer-facing reports & emails. */
  brandedReports: boolean;
  /** Premium theme packs beyond the default appearance. */
  customThemes: boolean;
  /** Extra export formats / polished PDF styling. */
  advancedExports: boolean;
  /** Extended analytics dashboards beyond the core reports. */
  advancedAnalytics: boolean;
  /** Enable premium first-party plugins (pro-tier ones). */
  premiumPlugins: boolean;
  /** Industry workflow packs (HVAC, plumbing, …). */
  industryPacks: boolean;
  /** AI workflow packs (prompts, automations, templates). */
  aiWorkflowPacks: boolean;
  /** Business-tier connectors: QuickBooks, Zapier, ERP/API, payroll-style. */
  businessIntegrations: boolean;
  /** "Official support" badge in the admin UI. */
  officialSupportBadge: boolean;
}

const FREE: FeatureFlags = {
  removeSponsorSlot: false,
  brandedReports: false,
  customThemes: false,
  advancedExports: false,
  advancedAnalytics: false,
  premiumPlugins: false,
  industryPacks: false,
  aiWorkflowPacks: false,
  businessIntegrations: false,
  officialSupportBadge: false,
};

// Founder = lifetime Pro: identical flags to pro.
const PRO: FeatureFlags = {
  ...FREE,
  removeSponsorSlot: true,
  brandedReports: true,
  customThemes: true,
  advancedExports: true,
  advancedAnalytics: true,
  premiumPlugins: true,
  industryPacks: true,
  aiWorkflowPacks: true,
  officialSupportBadge: true,
};

const BUSINESS: FeatureFlags = { ...PRO, businessIntegrations: true };

/** Resolve the feature set for a plan. Unknown/missing plans get free. */
export function featuresForPlan(plan: string | undefined | null): FeatureFlags {
  switch (plan as Plan) {
    case "pro":
    case "founder":
      return PRO;
    case "business":
      return BUSINESS;
    default:
      return FREE;
  }
}
