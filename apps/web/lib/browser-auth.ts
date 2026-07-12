const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface BrowserSessionUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "dispatcher" | "technician";
}

export interface BrowserLoginResult {
  user: BrowserSessionUser;
  orgId: string;
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) throw new Error(`authentication failed: ${response.status}`);
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export function browserLogin(email: string, password: string) {
  return authRequest<BrowserLoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function browserCurrentUser() {
  return authRequest<BrowserSessionUser>("/api/auth/me");
}

export function browserLogout() {
  return authRequest<void>("/api/auth/logout", { method: "POST" });
}
