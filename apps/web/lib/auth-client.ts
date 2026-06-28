const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export interface LoginResult {
  orgId: string;
  user: { name: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `login failed (${res.status})`);
  return res.json() as Promise<LoginResult>;
}

export async function logout(): Promise<{ ok: true }> {
  const res = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`logout failed (${res.status})`);
  return res.json() as Promise<{ ok: true }>;
}
