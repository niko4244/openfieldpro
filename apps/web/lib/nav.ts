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
  { href: "/dashboard", label: "Dashboard", icon: "◈", roles: ["owner", "dispatcher", "technician"] },
  { href: "/pipeline", label: "Pipeline", icon: "⊟", roles: ["owner", "dispatcher"] },
  // Phase 7: dispatch board reachable by owner + dispatcher only. The
  // technician-side counterpart lives at /dashboard/tech (live GPS share).
  { href: "/dashboard/dispatch", label: "Dispatch", icon: "≋", roles: ["owner", "dispatcher"] },
  { href: "/dashboard/inventory", label: "Inventory", icon: "▦", roles: ["owner", "dispatcher"] },
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
  userId?: string;
  orgId?: string;
  name?: string;
  email?: string;
  role?: RoleName;
}

export interface StoredSession {
  name: string;
  email?: string;
  role?: RoleName;
}

function isRoleName(value: unknown): value is RoleName {
  return value === "owner" || value === "dispatcher" || value === "technician";
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const parsed = JSON.parse(decodeBase64Url(payload)) as JwtPayload;
    return {
      ...parsed,
      role: isRoleName(parsed.role) ? parsed.role : undefined,
    };
  } catch {
    return null;
  }
}

function readStoredUser(): Partial<StoredSession> | null {
  try {
    const raw = localStorage.getItem("ofp_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      role: isRoleName(parsed.role) ? parsed.role : undefined,
    };
  } catch {
    return null;
  }
}

export function readStoredSession(): StoredSession | null {
  const token = localStorage.getItem("ofp_token");
  if (!token) return null;

  const payload = decodeJwt(token);
  const storedUser = readStoredUser();
  const role = payload?.role ?? storedUser?.role;
  const name =
    payload?.name ??
    storedUser?.name ??
    payload?.email ??
    storedUser?.email ??
    "Signed in";

  return {
    name,
    email: payload?.email ?? storedUser?.email,
    role,
  };
}

/** Filter the link list by a role. Items without a `roles` array always pass. */
export function visibleNavLinks(role: RoleName | undefined | null): readonly NavLink[] {
  if (!role) return NAV_LINKS;
  return NAV_LINKS.filter((l) => !l.roles || l.roles.includes(role));
}
