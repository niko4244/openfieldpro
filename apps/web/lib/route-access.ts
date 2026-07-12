export type WorkspaceRole = "owner" | "dispatcher" | "technician";

const PUBLIC_ROUTE_PREFIXES = [
  "/login",
  "/welcome",
  "/portal",
] as const;

const OWNER_ONLY_ROUTE_PREFIXES = [
  "/integrations",
  "/settings",
] as const;

const TECHNICIAN_EXACT_ROUTES = new Set([
  "/",
  "/closeout",
  "/price-book",
  "/access-denied",
]);

const UUID_PATH_SEGMENT =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const DIAGNOSTIC_SESSION_ROUTE = new RegExp(`^/diagnostics/${UUID_PATH_SEGMENT}$`);

function exactOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isSingleChild(pathname: string, prefix: string) {
  if (!pathname.startsWith(`${prefix}/`)) return false;
  const child = pathname.slice(prefix.length + 1);
  return child.length > 0 && !child.includes("/");
}

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => exactOrChild(pathname, prefix));
}

export function isOwnerOnlyRoute(pathname: string) {
  return OWNER_ONLY_ROUTE_PREFIXES.some((prefix) => exactOrChild(pathname, prefix));
}

export function isTechnicianRoute(pathname: string) {
  if (TECHNICIAN_EXACT_ROUTES.has(pathname)) return true;

  if (pathname === "/jobs") return true;
  if (isSingleChild(pathname, "/jobs") && pathname !== "/jobs/new") return true;

  if (pathname === "/customers" || isSingleChild(pathname, "/customers")) return true;

  if (pathname === "/diagnostics/new") return true;
  if (DIAGNOSTIC_SESSION_ROUTE.test(pathname)) return true;

  return false;
}

export function safeWorkspaceReturnPath(value?: string | null) {
  if (!value) return "/";
  try {
    const base = "https://openfieldpro.local";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export type RouteAccessDecision =
  | "public"
  | "allowed"
  | "authentication-required"
  | "forbidden";

export function routeAccessDecision(
  pathname: string,
  role?: string | null,
): RouteAccessDecision {
  if (isPublicRoute(pathname)) return "public";
  if (!role) return "authentication-required";
  if (pathname === "/access-denied") return "allowed";

  if (role === "owner") return "allowed";
  if (role === "dispatcher") {
    return isOwnerOnlyRoute(pathname) ? "forbidden" : "allowed";
  }
  if (role === "technician") {
    return isTechnicianRoute(pathname) ? "allowed" : "forbidden";
  }
  return "forbidden";
}
