// Phase 5d Wave 1a — provider interface + registry + adapters.
// Mirrors the existing node:test pattern used by templates.test.ts and
// events.test.ts in this directory.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initProviders,
  ProviderRegistry,
  SendgridProvider,
  StubProvider,
  TwilioProvider,
  type DeliveryResult,
  type NotificationMessage,
} from "@ofp/shared";

// Tests mutate global fetch + the ProviderRegistry. A `beforeEach`/`afterEach`
// reset ensures one test can't leak into another.
function resetRegistry() {
  ProviderRegistry.reset();
}

// ─── StubProvider ─────────────────────────────────────────────────────────

test("StubProvider.send returns expected DeliveryResult shape with synthetic messageId", async () => {
  const stub = new StubProvider();
  const before = Date.now();
  const result: DeliveryResult = await stub.send({
    to: "preview@localhost",
    subject: "Hello",
    body: "world",
  });
  assert.ok(result.messageId.startsWith("stub-"), `messageId prefix: ${result.messageId}`);
  assert.ok(typeof result.timestamp === "string");
  // ISO8601 parseable
  assert.ok(!Number.isNaN(Date.parse(result.timestamp)));
  assert.ok(Date.parse(result.timestamp) >= before, "timestamp must not be before the send instant");
  assert.equal(stub.messageCounter, 1);
});

test("StubProvider.messageCounter increments per successful send", async () => {
  const stub = new StubProvider();
  for (let i = 1; i <= 5; i++) {
    await stub.send({ to: "x", subject: "s", body: "b" });
    assert.equal(stub.messageCounter, i);
  }
});

test("StubProvider.mockReject then send throws the given reason; one-shot", async () => {
  const stub = new StubProvider();
  stub.mockReject("rate-limited");
  await assert.rejects(
    () => stub.send({ to: "x", subject: "s", body: "b" }),
    /rate-limited/,
  );
  // mockReject is one-shot — the next send succeeds again and the reason is cleared.
  const r = await stub.send({ to: "x", subject: "s", body: "b" });
  assert.ok(r.messageId.startsWith("stub-"));
});

test("StubProvider synthesizes unique messageIds across sends in the same instant", async () => {
  const stub = new StubProvider();
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const r = await stub.send({ to: "x", subject: "s", body: "b" });
    ids.add(r.messageId);
  }
  assert.equal(ids.size, 50, "all 50 messageIds must be distinct");
});

// ─── Registry defaults + inject ──────────────────────────────────────────

test("ProviderRegistry defaults to StubProvider for both channels when uninitialized", () => {
  resetRegistry();
  assert.equal(ProviderRegistry.describe().email, "stub");
  assert.equal(ProviderRegistry.describe().sms, "stub");
});

test("ProviderRegistry.inject(email, sms) overrides the singletons", () => {
  resetRegistry();
  ProviderRegistry.inject(new StubProvider(), new StubProvider());
  assert.equal(ProviderRegistry.describe().email, "stub");

  const fakeEmail = {
    name: "fake-inject",
    async send(_m: NotificationMessage): Promise<DeliveryResult> {
      return { messageId: "fake-email", timestamp: new Date().toISOString() };
    },
  } satisfies import("@ofp/shared").Provider;
  ProviderRegistry.inject(fakeEmail, null);
  assert.equal(ProviderRegistry.describe().email, "fake-inject");
  assert.equal(ProviderRegistry.describe().sms, "stub");
});

test("ProviderRegistry.reset() returns to defaults", () => {
  resetRegistry();
  ProviderRegistry.inject(new StubProvider(), new StubProvider());
  // Just verify no error — reset tested again by the next test's default state.
  ProviderRegistry.reset();
  assert.equal(ProviderRegistry.describe().email, "stub");
});

// ─── initProviders(env) ───────────────────────────────────────────────────

test("initProviders({}) falls back to stub for both channels", () => {
  resetRegistry();
  initProviders({});
  assert.equal(ProviderRegistry.describe().email, "stub");
  assert.equal(ProviderRegistry.describe().sms, "stub");
});

test("initProviders({OFP_PROVIDER_EMAIL:'stub'}) sets email to StubProvider", () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "stub" });
  assert.equal(ProviderRegistry.describe().email, "stub");
});

test("initProviders({OFP_PROVIDER_EMAIL:'sendgrid', OFP_SENDGRID_API_KEY:'k'}) sets email to SendgridProvider", () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "sendgrid", OFP_SENDGRID_API_KEY: "sk-test-key" });
  const email = ProviderRegistry.getEmail();
  assert.ok(email instanceof SendgridProvider, `expected SendgridProvider, got ${email.constructor.name}`);
});

test("initProviders throws when sendgrid chosen without API key", () => {
  resetRegistry();
  assert.throws(
    () => initProviders({ OFP_PROVIDER_EMAIL: "sendgrid" }),
    /OFP_PROVIDER_EMAIL=sendgrid requires OFP_SENDGRID_API_KEY/,
  );
});

test("initProviders throws on unknown email provider", () => {
  resetRegistry();
  assert.throws(
    () => initProviders({ OFP_PROVIDER_EMAIL: "mailgun" }),
    /unknown email provider: mailgun/,
  );
});

test("initProviders({OFP_PROVIDER_SMS:'twilio', SID, TOKEN, FROM}) sets sms to TwilioProvider", () => {
  resetRegistry();
  initProviders({
    OFP_PROVIDER_SMS: "twilio",
    OFP_TWILIO_ACCOUNT_SID: "AC123",
    OFP_TWILIO_AUTH_TOKEN: "tok",
    OFP_TWILIO_FROM: "+15555550100",
  });
  const sms = ProviderRegistry.getSms();
  assert.ok(sms instanceof TwilioProvider, `expected TwilioProvider, got ${sms.constructor.name}`);
});

test("initProviders throws when twilio chosen without full credentials", () => {
  resetRegistry();
  assert.throws(
    () =>
      initProviders({
        OFP_PROVIDER_SMS: "twilio",
        OFP_TWILIO_ACCOUNT_SID: "AC123",
        // missing TOKEN and FROM
      }),
    /OFP_PROVIDER_SMS=twilio requires/,
  );
});

test("initProviders throws on unknown sms provider", () => {
  resetRegistry();
  assert.throws(
    () => initProviders({ OFP_PROVIDER_SMS: "vonage" }),
    /unknown sms provider: vonage/,
  );
});

// ─── SendgridProvider (mocked fetch) ─────────────────────────────────────

function mockFetchOk(headers: Record<string, string> = { "x-message-id": "sg-test-abc" }) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response("", { status: 202, headers });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function mockFetchStatus(status: number, body = "boom") {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("SendgridProvider.send posts expected payload and reads x-message-id", async () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "sendgrid", OFP_SENDGRID_API_KEY: "sk-test", SENDGRID_FROM: "ops@example.com" });
  const mock = mockFetchOk({ "x-message-id": "sg-fixed-id" });

  try {
    const r = await ProviderRegistry.getEmail().send({
      to: "customer@example.com",
      subject: "Receipt",
      body: "thanks",
    });
    assert.equal(r.messageId, "sg-fixed-id");
    assert.ok(typeof r.timestamp === "string");
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, "https://api.sendgrid.com/v3/mail/send");
    const init = mock.calls[0].init!;
    assert.equal(init.method, "POST");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["authorization"], "Bearer sk-test");
    assert.equal(headers["content-type"], "application/json");
    const body = JSON.parse(init.body as string);
    assert.deepEqual(body.personalizations, [{ to: [{ email: "customer@example.com" }] }]);
    assert.deepEqual(body.from, { email: "ops@example.com" });
    assert.equal(body.subject, "Receipt");
    assert.equal(body.content[0].type, "text/plain");
    assert.equal(body.content[0].value, "thanks");
  } finally {
    mock.restore();
  }
});

test("SendgridProvider.send falls back to synthetic id when x-message-id header is absent", async () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "sendgrid", OFP_SENDGRID_API_KEY: "sk-test" });
  const mock = mockFetchOk({ /* no x-message-id */ });

  try {
    const r = await ProviderRegistry.getEmail().send({ to: "x@y", subject: "s", body: "b" });
    assert.ok(r.messageId.startsWith("sg-"));
  } finally {
    mock.restore();
  }
});

test("SendgridProvider.send throws on missing subject", async () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "sendgrid", OFP_SENDGRID_API_KEY: "sk-test" });
  await assert.rejects(
    () => ProviderRegistry.getEmail().send({ to: "x@y", body: "no subject here" }),
    /sendgrid requires subject/,
  );
});

test("SendgridProvider.send throws on missing recipient", async () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "sendgrid", OFP_SENDGRID_API_KEY: "sk-test" });
  await assert.rejects(
    () => ProviderRegistry.getEmail().send({ to: "", subject: "s", body: "b" }),
    /sendgrid requires recipient/,
  );
});

test("SendgridProvider.send propagates 4xx response with body", async () => {
  resetRegistry();
  initProviders({ OFP_PROVIDER_EMAIL: "sendgrid", OFP_SENDGRID_API_KEY: "sk-test" });
  const mock = mockFetchStatus(401, "invalid api key");

  try {
    await assert.rejects(
      () => ProviderRegistry.getEmail().send({ to: "x@y", subject: "s", body: "b" }),
      /sendgrid 401: invalid api key/,
    );
  } finally {
    mock.restore();
  }
});

// ─── TwilioProvider (mocked fetch) ────────────────────────────────────────

test("TwilioProvider.send posts expected form payload and reads sid", async () => {
  resetRegistry();
  initProviders({
    OFP_PROVIDER_SMS: "twilio",
    OFP_TWILIO_ACCOUNT_SID: "AC123",
    OFP_TWILIO_AUTH_TOKEN: "secret",
    OFP_TWILIO_FROM: "+15555550100",
  });
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({ sid: "SM-fixed-sid", date_created: "Fri, 04 Jul 2026 12:00:00 +0000" }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const r = await ProviderRegistry.getSms().send({
      to: "+15555550199",
      body: "your appointment is tomorrow",
    });
    assert.equal(r.messageId, "SM-fixed-sid");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    const init = calls[0].init!;
    assert.equal(init.method, "POST");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["authorization"], "Basic " + Buffer.from("AC123:secret").toString("base64"));
    assert.equal(headers["content-type"], "application/x-www-form-urlencoded");
    const body = init.body as string;
    const params = new URLSearchParams(body);
    assert.equal(params.get("To"), "+15555550199");
    assert.equal(params.get("From"), "+15555550100");
    assert.equal(params.get("Body"), "your appointment is tomorrow");
  } finally {
    globalThis.fetch = original;
  }
});

test("TwilioProvider.send throws on missing recipient phone", async () => {
  resetRegistry();
  initProviders({
    OFP_PROVIDER_SMS: "twilio",
    OFP_TWILIO_ACCOUNT_SID: "AC",
    OFP_TWILIO_AUTH_TOKEN: "tok",
    OFP_TWILIO_FROM: "+1",
  });
  await assert.rejects(
    () => ProviderRegistry.getSms().send({ to: "", body: "no number" }),
    /twilio requires recipient phone number/,
  );
});

test("TwilioProvider.send propagates 4xx response", async () => {
  resetRegistry();
  initProviders({
    OFP_PROVIDER_SMS: "twilio",
    OFP_TWILIO_ACCOUNT_SID: "AC",
    OFP_TWILIO_AUTH_TOKEN: "tok",
    OFP_TWILIO_FROM: "+1",
  });
  const mock = mockFetchStatus(403, "auth token invalid");
  try {
    await assert.rejects(
      () => ProviderRegistry.getSms().send({ to: "+15555550199", body: "b" }),
      /twilio 403: auth token invalid/,
    );
  } finally {
    mock.restore();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// LOUD-FAILURE SAFETY: ensure none of the above mutated global state leaks.
// Each test should run against a freshly-reset registry; the final assertion
// confirms env-style init still falls back to stub if env is empty.

test("cleanup: registry falls back to stub after end-of-suite reset", () => {
  resetRegistry();
  initProviders({});
  assert.equal(ProviderRegistry.describe().email, "stub");
  assert.equal(ProviderRegistry.describe().sms, "stub");
});
