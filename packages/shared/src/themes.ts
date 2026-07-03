// Theme packs: a cosmetic accent-color reskin, orthogonal to the existing
// light/dark MODE toggle (apps/web/components/theme-provider.tsx). A pack is
// applied via `data-theme-pack="<id>"` on <html> and overrides only
// --color-accent/--color-accent-hover/--color-accent-muted in
// apps/web/app/globals.css — it never touches contrast-critical surface/fg
// colors, so accessibility holds under either light or dark mode.
// "default" and "dark" are no-ops (both render the app's standard accent);
// everything else requires Pro. ponytail: accent-only reskin, not a full
// visual overhaul. Ceiling: a pack that also restyles typography/spacing.
// Upgrade: extend the CSS block per id once a premium pack needs it.
import type { Plan } from "./index.js";

export const THEME_IDS = [
  "default",
  "dark",
  "blue-collar",
  "industrial",
  "minimal",
  "seasonal-halloween",
  "seasonal-christmas",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  /** Minimum plan (via planAtLeast) that may activate this theme. */
  tierRequired: Plan;
}

export const THEMES: ThemeMeta[] = [
  { id: "default", name: "Default", description: "The standard OpenFieldPro accent.", tierRequired: "free" },
  { id: "dark", name: "Dark", description: "Same accent as Default — pairs with dark mode.", tierRequired: "free" },
  { id: "blue-collar", name: "Blue Collar", description: "High-contrast amber accent for trade crews.", tierRequired: "pro" },
  { id: "industrial", name: "Industrial", description: "Steel-grey accent with safety-orange highlights.", tierRequired: "pro" },
  { id: "minimal", name: "Minimal", description: "Muted, low-chroma accent.", tierRequired: "pro" },
  { id: "seasonal-halloween", name: "Halloween", description: "Seasonal orange/purple accent pack.", tierRequired: "pro" },
  { id: "seasonal-christmas", name: "Christmas", description: "Seasonal red/green accent pack.", tierRequired: "pro" },
];
