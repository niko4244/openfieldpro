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

function exactOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
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
  if (pathname.startsWith("/jobs/") && pathname !== "/jobs/new") return true;

  if (pathname === "/customers" || pathname.startsWith("/customers/")) return true;

  if (pathname === "/diagnostics/new") return true;
  if (/^\/diagnostics\/[0-9a-fA-F-]{36}$/.test(pathname)) return true;

  return false;
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
