import assert from "node:assert/strict";
import test from "node:test";
import {
  NativeRequestError,
  nativeLogin,
  nativeRequest,
  scopedDatabaseName,
  type NativeSession,
} from "../src/auth.ts";

const session: NativeSession = {
  token: "header.payload.signature",
  orgId: "org-123",
  user: {
    id: "user-456",
    name: "Alex Technician",
    email: "alex@example.test",
    role: "technician",
  },
};

test("native login uses the dedicated protocol and normalizes email", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify(session), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.deepEqual(
      await nativeLogin("https://field.example.test/base", "  Alex@Example.Test ", "correct horse"),
      session,
    );
    assert.equal(captured?.url, "https://field.example.test/api/auth/native-login");
    assert.equal(captured?.init?.method, "POST");
    const headers = new Headers(captured?.init?.headers);
    assert.equal(headers.get("x-openfieldpro-client"), "native");
    assert.deepEqual(JSON.parse(String(captured?.init?.body)), {
      email: "alex@example.test",
      password: "correct horse",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated native requests stay on-origin and lock identity headers", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify([{ id: "job-1" }]), { status: 200 });
  };

  try {
    assert.deepEqual(
      await nativeRequest("https://field.example.test", session, "/api/jobs", {
        headers: {
          authorization: "Bearer attacker-controlled",
          "x-org-id": "other-org",
          "x-openfieldpro-client": "browser",
        },
      }),
      [{ id: "job-1" }],
    );
    assert.equal(captured?.url, "https://field.example.test/api/jobs");
    const headers = new Headers(captured?.init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${session.token}`);
    assert.equal(headers.get("x-org-id"), session.orgId);
    assert.equal(headers.get("x-openfieldpro-client"), "native");
    await assert.rejects(
      () => nativeRequest("https://field.example.test", session, "https://evil.example/api/jobs"),
      /must use an \/api\//,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("terminal authorization failures are distinguishable from network failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "authentication required" }), { status: 401 });

  try {
    await assert.rejects(
      () => nativeRequest("https://field.example.test", session, "/api/jobs"),
      (caught: unknown) =>
        caught instanceof NativeRequestError &&
        caught.status === 401 &&
        caught.terminalAuthenticationFailure,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production API transport requires HTTPS while emulator localhost remains available", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(session), { status: 200 });

  try {
    await assert.rejects(
      () => nativeLogin("http://field.example.test", "alex@example.test", "password"),
      /requires an HTTPS API origin/,
    );
    await nativeLogin("http://10.0.2.2:3001", "alex@example.test", "password");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offline database names are deterministic, filesystem-safe, and user-isolated", () => {
  const first = scopedDatabaseName("Org/One", "User A");
  const second = scopedDatabaseName("Org/One", "User B");
  assert.equal(first, "openfieldpro-field-org-one-user-a.db");
  assert.equal(second, "openfieldpro-field-org-one-user-b.db");
  assert.notEqual(first, second);
  assert.match(first, /^[a-z0-9._-]+$/);
});
