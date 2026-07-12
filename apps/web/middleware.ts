import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { routeAccessDecision } from "./lib/route-access";

const AUTH_API_URL = (
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001"
).replace(/\/$/, "");

interface SessionUser {
  id: string;
  role: string;
}

function signInRedirect(request: NextRequest, clearSession = false) {
  const destination = request.nextUrl.clone();
  destination.pathname = "/login";
  destination.search = "";
  destination.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const response = NextResponse.redirect(destination);
  if (clearSession) {
    response.cookies.set({
      name: "ofp_session",
      value: "",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

function accessDeniedRedirect(request: NextRequest) {
  const destination = request.nextUrl.clone();
  destination.pathname = "/access-denied";
  destination.search = "";
  destination.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(destination);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const publicDecision = routeAccessDecision(pathname, null);
  if (publicDecision === "public") return NextResponse.next();

  const sessionCookie = request.cookies.get("ofp_session")?.value;
  if (!sessionCookie) return signInRedirect(request);

  let sessionResponse: Response;
  try {
    sessionResponse = await fetch(`${AUTH_API_URL}/api/auth/me`, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
  } catch {
    return new NextResponse("Authentication service unavailable", {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  if (sessionResponse.status === 401 || sessionResponse.status === 403) {
    return signInRedirect(request, true);
  }
  if (!sessionResponse.ok) {
    return new NextResponse("Authentication service unavailable", {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  let user: SessionUser;
  try {
    user = (await sessionResponse.json()) as SessionUser;
  } catch {
    return signInRedirect(request, true);
  }

  const decision = routeAccessDecision(pathname, user.role);
  if (decision === "forbidden") return accessDeniedRedirect(request);
  if (decision === "authentication-required") return signInRedirect(request, true);
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)",
  ],
};
