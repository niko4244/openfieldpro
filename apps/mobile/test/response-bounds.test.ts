import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_NATIVE_API_RESPONSE_BYTES,
  MAX_NATIVE_LOGIN_RESPONSE_BYTES,
  NativeRequestError,
  nativeLogin,
  nativeRequest,
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

test("declared oversized native login responses are rejected before JSON parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(session), {
      status: 200,
      headers: { "content-length": String(MAX_NATIVE_LOGIN_RESPONSE_BYTES + 1) },
    });
  try {
    await assert.rejects(
      () => nativeLogin("https://field.example.test", "alex@example.test", "password"),
      (caught: unknown) =>
        caught instanceof NativeRequestError &&
        caught.status === 502 &&
        /response limit/.test(caught.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("actual oversized native API bodies are rejected without a content-length header", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("x".repeat(MAX_NATIVE_API_RESPONSE_BYTES + 1), { status: 200 });
  try {
    await assert.rejects(
      () => nativeRequest("https://field.example.test", session, "/api/jobs"),
      (caught: unknown) =>
        caught instanceof NativeRequestError &&
        caught.status === 502 &&
        /response limit/.test(caught.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful non-JSON responses fail explicitly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  try {
    await assert.rejects(
      () => nativeRequest("https://field.example.test", session, "/api/jobs"),
      (caught: unknown) =>
        caught instanceof NativeRequestError &&
        caught.status === 502 &&
        /valid JSON/.test(caught.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("oversized error bodies cannot flow into terminal error messages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "secret detail" }), {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-length": "999999" },
    });
  try {
    await assert.rejects(
      () => nativeRequest("https://field.example.test", session, "/api/jobs"),
      (caught: unknown) =>
        caught instanceof NativeRequestError &&
        caught.status === 401 &&
        caught.terminalAuthenticationFailure &&
        caught.message === "401 Unauthorized",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
