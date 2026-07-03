// A plugin's manifest — the `plugin.json` an author publishes (or authors in TS
// via `defineManifest`). The OFP server stores these as rows in the `plugins`
// table; the fields here are the author-controlled subset.
import type { PluginEventKind } from "./events.js";

export interface PluginManifest {
  /** Stable unique id, e.g. "twilio-sms". Lowercase, hyphenated. */
  slug: string;
  name: string;
  description?: string;
  /** semver, e.g. "1.0.0". */
  version: string;
  author?: string;
  iconUrl?: string;
  /** Catalog grouping, e.g. "accounting" | "communications" | "ai". */
  category?: string;
  /**
   * Open-core gate: minimum plan required to install/enable this plugin
   * ("free" | "pro" | "founder" | "business"). Omit for free. For
   * first-party plugins the server-side REQUIRED_PLAN map in
   * apps/api/src/routes/plugins.ts remains authoritative — a manifest
   * can't grant itself a lower tier than the server enforces.
   */
  tierRequired?: string;
  /** Set for plugins that run without any external service. */
  localOnly?: boolean;
  /** Feature flags (see @ofp/shared featuresForPlan) this plugin lights up. */
  featureFlags?: string[];
  /** Domain events to subscribe to. Must be drawn from PLUGIN_EVENTS. */
  events: PluginEventKind[];
  /**
   * OAuth-style scopes the plugin requests for its inbound token, e.g.
   * ["customers:read", "jobs:read"]. Use ["*"] to request full read access.
   */
  scopes: string[];
  /** Default endpoint the signed event webhooks are POSTed to. */
  webhookUrl?: string;
}

/** Identity helper that gives a `plugin.json`-in-TS full type-checking. */
export function defineManifest(manifest: PluginManifest): PluginManifest {
  return manifest;
}
