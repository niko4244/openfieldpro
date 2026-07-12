import assert from "node:assert/strict";
import test from "node:test";
import {
  browserCurrentUser,
  browserLogin,
  browserLogout,
} from "./browser-auth";

const user = {
  id: "owner-1",
  name: "Morgan Owner",
  email: "owner@example.test",
  role: "owner" as const,
};

test("browser login includes credentials and exposes no token", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify({ user, orgId: "org-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await browserLogin("owner@example.test", "correct-horse-battery-staple");
    assert.deepEqual(result, { user, orgId: "org-1" });
    assert.equal("token" in result, false);
    assert.equal(captured?.url, "http://localhost:3001/api/auth/login");
    assert.equal(captured?.init?.method, "POST");
    assert.equal(captured?.init?.credentials, "include");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("current user and logout keep the cookie credential transport", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const pathname = new URL(String(input)).pathname;
    if (pathname === "/api/auth/me") {
      return new Response(JSON.stringify(user), { status: 200 });
    }
    return new Response("", { status: 200 });
  };

  try {
    assert.deepEqual(await browserCurrentUser(), user);
    await browserLogout();
    assert.deepEqual(
      calls.map((call) => ({
        pathname: new URL(call.url).pathname,
        method: call.init?.method ?? "GET",
        credentials: call.init?.credentials,
      })),
      [
        { pathname: "/api/auth/me", method: "GET", credentials: "include" },
        { pathname: "/api/auth/logout", method: "POST", credentials: "include" },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
