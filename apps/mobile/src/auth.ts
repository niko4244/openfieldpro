import { utf8ByteLength } from "./utf8";

export const MAX_NATIVE_LOGIN_RESPONSE_BYTES = 64_000;
export const MAX_NATIVE_API_RESPONSE_BYTES = 6_000_000;
const MAX_NATIVE_ERROR_RESPONSE_BYTES = 32_000;

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
  readonly status: number;
  readonly terminalAuthenticationFailure: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NativeRequestError";
    this.status = status;
    this.terminalAuthenticationFailure = status === 401 || status === 403;
  }
}

function normalizedApiOrigin(apiUrl: string) {
  const parsed = new URL(apiUrl);
  const developmentHost = ["localhost", "127.0.0.1", "10.0.2.2"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && developmentHost)) {
    throw new Error("The technician app requires an HTTPS API origin outside local development.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("The technician app API origin must not contain embedded credentials.");
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
  if (!endpoint.pathname.startsWith("/api/")) {
    throw new Error("Native API requests must remain inside the /api/ namespace after URL normalization.");
  }
  return endpoint.toString();
}

async function readBoundedText(response: Response, maxBytes: number, label: string) {
  const declared = response.headers.get("content-length");
  if (declared) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes >= 0 && declaredBytes > maxBytes) {
      throw new NativeRequestError(502, `${label} exceeds the ${maxBytes} byte response limit`);
    }
  }

  const text = await response.text();
  if (utf8ByteLength(text) > maxBytes) {
    throw new NativeRequestError(502, `${label} exceeds the ${maxBytes} byte response limit`);
  }
  return text;
}

async function responseMessage(response: Response) {
  const body = await readBoundedText(response, MAX_NATIVE_ERROR_RESPONSE_BYTES, "error response").catch(
    () => "",
  );
  if (!body) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : `${response.status} ${response.statusText}`.trim();
  } catch {
    return `${response.status} ${response.statusText}`.trim();
  }
}

async function parseJson<T>(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await readBoundedText(response, maxBytes, label);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NativeRequestError(502, `${label} did not contain valid JSON`);
  }
}

function sessionHeaders(session: NativeSession, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${session.token}`);
  headers.set("x-org-id", session.orgId);
  headers.set("x-openfieldpro-client", "native");
  return headers;
}

function utf8Bytes(value: string) {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return bytes;
}

function validSessionIdentifier(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return utf8Bytes(value).length <= 64;
  } catch {
    return false;
  }
}

function validBearerToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8192 && !/\s/.test(value);
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

  const session = await parseJson<NativeSession>(
    response,
    MAX_NATIVE_LOGIN_RESPONSE_BYTES,
    "native login response",
  );
  if (
    !validBearerToken(session?.token) ||
    !validSessionIdentifier(session?.orgId) ||
    !validSessionIdentifier(session?.user?.id) ||
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
  return parseJson<T>(response, MAX_NATIVE_API_RESPONSE_BYTES, "native API response");
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64Url(value: string) {
  if (!validSessionIdentifier(value)) {
    throw new Error("Offline storage identity values must encode to between 1 and 64 UTF-8 bytes.");
  }

  const bytes = utf8Bytes(value);
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64URL_ALPHABET[(combined >>> 18) & 63];
    output += BASE64URL_ALPHABET[(combined >>> 12) & 63];
    if (second !== undefined) output += BASE64URL_ALPHABET[(combined >>> 6) & 63];
    if (third !== undefined) output += BASE64URL_ALPHABET[combined & 63];
  }
  return output;
}

export function scopedDatabaseName(orgId: string, userId: string) {
  return `openfieldpro-field-v2-${base64Url(orgId)}-${base64Url(userId)}.db`;
}
