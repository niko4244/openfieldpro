// Authenticated API client for the technician app. One module owns the
// session token and stamps every request.
//
// ponytail: token lives in memory only, so a cold app start asks for login
//   again. Ceiling: technician annoyance on daily launches. Upgrade: persist
//   with expo-secure-store once the workspace can take new deps (blocked by
//   a pnpm store-version mismatch at time of writing).
import type { JobDTO, Plan } from "@ofp/shared";
import { Platform } from "react-native";

export const API =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://localhost:3001");

let token: string | null = process.env.EXPO_PUBLIC_AUTH_TOKEN ?? null;

export function setToken(t: string | null): void {
  token = t;
}

export function hasToken(): boolean {
  return !!token;
}

export function getToken(): string {
  return token ?? "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const r = await request<{ token: string; user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(r.token);
  return r.user;
}

export interface AppointmentDTO {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface InvoiceDTO {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
}

export interface OrgDTO {
  id: string;
  name: string;
  timezone: string;
  plan: Plan;
}

export const api = {
  jobs: () => request<JobDTO[]>("/api/jobs"),
  appointments: () => request<AppointmentDTO[]>("/api/appointments"),
  invoices: () => request<InvoiceDTO[]>("/api/invoices"),
  org: () => request<OrgDTO>("/api/org"),
};
