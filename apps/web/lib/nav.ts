// Shared navigation links and JWT helpers used by Sidebar and (future) MobileNav.
// Phase 7 made links role-aware so the sidebar can filter by the JWT role claim.

export type RoleName = "owner" | "dispatcher" | "technician";

export interface NavLink {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  /** Roles allowed to see this link. `undefined` = visible to everyone. */
  readonly roles?: readonly RoleName[];
}

// Ponytail: link→role mapping inline keeps NavLink single-source. Ceiling:
// if we add per-link sub-features (e.g. Settings sub-menu), move the map
// into `features/roles.ts` and derive from there.
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Dashboard", icon: "◈", roles: ["owner", "dispatcher", "technician"] },
  { href: "/pipeline", label: "Pipeline", icon: "⊟", roles: ["owner", "dispatcher"] },
  // Phase 7: dispatch board reachable by owner + dispatcher only. The
  // technician-side counterpart lives at /dashboard/tech (live GPS share).
  { href: "/dashboard/dispatch", label: "Dispatch", icon: "≋", roles: ["owner", "dispatcher"] },
  // Phase 7: tech-mode mobile page; technicians only.
  { href: "/dashboard/tech", label: "Tech Mode", icon: "◉", roles: ["technician"] },
  { href: "/jobs", label: "Jobs", icon: "⊞", roles: ["owner", "dispatcher", "technician"] },
  { href: "/customers", label: "Customers", icon: "⊕", roles: ["owner", "dispatcher"] },
  { href: "/schedule", label: "Schedule", icon: "◐", roles: ["owner", "dispatcher", "technician"] },
  { href: "/estimates", label: "Estimates", icon: "◷", roles: ["owner", "dispatcher"] },
  { href: "/invoices", label: "Invoices", icon: "◎", roles: ["owner", "dispatcher"] },
  { href: "/price-book", label: "Price Book", icon: "⊡", roles: ["owner", "dispatcher"] },
  { href: "/reviews", label: "Reviews", icon: "★", roles: ["owner", "dispatcher"] },
  { href: "/reports", label: "Reports", icon: "◫", roles: ["owner", "dispatcher"] },
  { href: "/integrations", label: "Integrations", icon: "⧉", roles: ["owner"] },
  { href: "/settings", label: "Settings", icon: "⚙", roles: ["owner"] },
];

export interface JwtPayload {
  name?: string;
  email?: string;
  role?: RoleName;
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    return JSON.parse(atob(token.split(".")[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/** Filter the link list by a role. Items without a `roles` array always pass. */
export function visibleNavLinks(role: RoleName | undefined | null): readonly NavLink[] {
  if (!role) return NAV_LINKS.filter((l) => !l.roles);
  return NAV_LINKS.filter((l) => !l.roles || l.roles.includes(role));
}
