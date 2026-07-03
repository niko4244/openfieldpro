// Theme-pack scaffolding. Metadata only for now — the web app ships the
// default appearance; premium themes land as CSS variable sets keyed by id.
// ponytail: no runtime theming engine yet. Ceiling: static list. Upgrade:
// a themes/ dir of CSS-variable files loaded by id in apps/web.
import type { Plan } from "./index.js";

export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  /** Minimum plan (via planAtLeast) that may activate this theme. */
  tierRequired: Plan;
}

export const THEMES: ThemeMeta[] = [
  { id: "default", name: "Default", description: "The standard OpenFieldPro look.", tierRequired: "free" },
  { id: "dark", name: "Dark", description: "Low-light default variant.", tierRequired: "free" },
  { id: "blue-collar", name: "Blue Collar", description: "High-contrast, big-target trade look.", tierRequired: "pro" },
  { id: "industrial", name: "Industrial", description: "Steel greys and safety accents.", tierRequired: "pro" },
  { id: "minimal", name: "Minimal", description: "Chrome-free, whitespace-heavy.", tierRequired: "pro" },
  { id: "seasonal-halloween", name: "Halloween", description: "Seasonal accent pack.", tierRequired: "pro" },
  { id: "seasonal-christmas", name: "Christmas", description: "Seasonal accent pack.", tierRequired: "pro" },
];
