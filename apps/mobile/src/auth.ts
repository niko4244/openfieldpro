export type NativeUserRole = "owner" | "dispatcher" | "technician";

export interface NativeSessionUser {
  id: string;
  name: string;
  email: string;
  role: NativeUserRole;
}

export interface NativeSession {
  token: string;
  orgId: string;
  user: NativeSessionUser;
}

export class NativeRequestError extends Error {
  readonly terminalAuthenticationFailure: boolean;

  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NativeRequestError";
    this.terminalAuthenticationFailure = status === 401 || status === 403;
  }
}

function normalizedApiOrigin(apiUrl: string) {
  const parsed = new URL(apiUrl);
  const developmentHost = ["localhost", "127.0.0.1", "10.0.2.2"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && developmentHost)) {
    throw new Error("The technician app requires an HTTPS API origin outside local development.");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function apiEndpoint(apiUrl: string, path: string) {
  if (!path.startsWith("/api/")) throw new Error("Native API requests must use an /api/ path.");
  const origin = normalizedApiOrigin(apiUrl);
  const endpoint = new URL(path, origin);
  if (endpoint.origin !== origin.origin) throw new Error("Native API requests must remain same-origin.");
  return endpoint.toString();
}

async function responseMessage(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : `${response.status} ${response.statusText}`.trim();
  } catch {
    return `${response.status} ${response.statusText}`.trim();
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function sessionHeaders(session: NativeSession, init?: RequestInit) {
  return {
    ...(init?.body ? { "content-type": "application/json" } : {}),
    authorization: `Bearer ${session.token}`,
    "x-org-id": session.orgId,
    "x-openfieldpro-client": "native",
    ...(init?.headers as Record<string, string> | undefined),
  };
}

export async function nativeLogin(
  apiUrl: string,
  email: string,
  password: string,
): Promise<NativeSession> {
  const response = await fetch(apiEndpoint(apiUrl, "/api/auth/native-login"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-openfieldpro-client": "native",
    },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!response.ok) throw new NativeRequestError(response.status, await responseMessage(response));

  const session = await parseJson<NativeSession>(response);
  if (
    !session?.token ||
    !session.orgId ||
    !session.user?.id ||
    !["owner", "dispatcher", "technician"].includes(session.user.role)
  ) {
    throw new Error("The authentication service returned an invalid native session.");
  }
  return session;
}

export async function nativeRequest<T>(
  apiUrl: string,
  session: NativeSession,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiEndpoint(apiUrl, path), {
    ...init,
    headers: sessionHeaders(session, init),
  });
  if (!response.ok) throw new NativeRequestError(response.status, await responseMessage(response));
  return parseJson<T>(response);
}

function safeScopePart(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^[-_]+|[-_]+$/g, "").slice(0, 64) || "unknown";
}

export function scopedDatabaseName(orgId: string, userId: string) {
  return `openfieldpro-field-${safeScopePart(orgId)}-${safeScopePart(userId)}.db`;
}
