// Phase 5d Wave 1a — provider wiring.
//
// A `Provider` is a delivery sink (SendGrid for email, Twilio for SMS).
// apps/api/src/lib/notify.ts and apps/worker/src/notify.ts both delegate to
// ProviderRegistry so the same SendGrid call fires whether the trigger was
// inline-evaluated (api-process) or tick-replayed (worker-process).
//
// ponytail: process-singleton registry. Tests bypass env via `.inject()`
// instead of touching process.env (env-pollution-free across suites).
//   Ceiling: multi-tenant per-org providers need a key-aware registry —
//   swap the env-shape init to a per-org DB lookup when that lands.
//
// ponytail: StubProvider is the dev default. Real SendGrid/Twilio calls
//   are gated on env vars (OFP_PROVIDER_* + *_API_KEY/SID/TOKEN). A
//   missing key falls back to the stub rather than crashing at boot
//   so the dev experience stays "send a templated message, see it
//   logged" with zero setup.
//   Ceiling: production env requires explicit `OFP_PROVIDER_*!=stub`
//   assert in apps/api/src/server.ts boot — add when prod is real.

export interface NotificationMessage {
  /** Recipient address (email for email channel, E.164 phone for sms). */
  to: string;
  /** Email only. SMS messages ignore this. */
  subject?: string;
  /** Plain-text body. HTML rendering happens at the provider layer. */
  body: string;
  /**
   * Free-shape metadata the provider can attach for tracing / batch
   * correlation. The OFP trigger engine uses this for
   * `{ ruleId, eventId, customerId }` so a deliverability dashboard
   * can later pivot from `provider_message_id` back to the firing
   * automation_run.
   */
  meta?: Record<string, unknown>;
}

/** Provider's acknowledgement that the message left our process. */
export interface DeliveryResult {
  /** Provider-issued correlation id (SendGrid `x-message-id`,
   *  Twilio `sid`). Analytics Wave 2 keys off this for webhook → run
   *  matching, so uniqueness across providers is required (not the
   *  same as our local rule/event ids). */
  messageId: string;
  /** ISO-8601 timestamp set by the provider when known. */
  timestamp: string;
  /** Raw provider response, preserved for debugging without coupling
   *  call sites to provider-specific shapes. */
  raw?: unknown;
}

export interface Provider {
  /** Stable identifier for diagnostics + the env-driven init switch. */
  readonly name: string;
  send(msg: NotificationMessage): Promise<DeliveryResult>;
}

// ─── StubProvider (default in dev) ────────────────────────────────────────

/**
 * In-process sink. Default behavior: success with a synthetic messageId.
 * Tests call `.mockReject(reason)` before `.send()` to assert the
 * failure path of the trigger engine without env pollution.
 */
export class StubProvider implements Provider {
  readonly name = "stub";
  messageCounter = 0;
  rejectWith: string | null = null;

  async send(_msg: NotificationMessage): Promise<DeliveryResult> {
    if (this.rejectWith) {
      const reason = this.rejectWith;
      this.rejectWith = null;
      throw new Error(reason);
    }
    this.messageCounter++;
    return {
      messageId: `stub-${Date.now()}-${this.messageCounter}`,
      timestamp: new Date().toISOString(),
    };
  }

  /** Test hook: next `.send()` throws the given reason, then clears. */
  mockReject(reason: string): void {
    this.rejectWith = reason;
  }
}

// ─── SendgridProvider (email) ─────────────────────────────────────────────

/**
 * Email provider backed by the SendGrid v3 Mail Send endpoint.
 * Requires `OFP_SENDGRID_API_KEY`; the optional `SENDGRID_FROM`
 * defaults to `noreply@ofp.local` for dev.
 *
 * ponytail: ponytails the response to extract `x-message-id` instead
 *   of relying on a session — SendGrid inbound webhook matching uses
 *   exactly this header. Ceiling: switch to web API v3.1 if/when we
 *   need templated transactional sends (not plain text).
 */
export class SendgridProvider implements Provider {
  readonly name = "sendgrid";
  constructor(
    private apiKey: string,
    private fromEmail: string = "noreply@ofp.local",
  ) {}

  async send(msg: NotificationMessage): Promise<DeliveryResult> {
    if (!msg.subject) {
      throw new Error("sendgrid requires subject for email messages");
    }
    if (!msg.to) {
      throw new Error("sendgrid requires recipient address");
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: this.fromEmail },
        subject: msg.subject,
        content: [{ type: "text/plain", value: msg.body }],
      }),
    });
    if (!res.ok) {
      throw new Error(`sendgrid ${res.status}: ${await res.text()}`);
    }
    return {
      messageId: res.headers.get("x-message-id") ?? `sg-${Date.now()}`,
      timestamp: new Date().toISOString(),
      raw: { status: res.status },
    };
  }
}

// ─── TwilioProvider (sms) ─────────────────────────────────────────────────

/**
 * SMS provider backed by the Twilio REST API.
 * Requires `OFP_TWILIO_ACCOUNT_SID`, `OFP_TWILIO_AUTH_TOKEN`, and
 * `OFP_TWILIO_FROM` (E.164). The returned `messageId` is Twilio's `sid`,
 * which is the correlation key for status webhooks (delivered, sent,
 * failed) in Wave 2's analytics path.
 */
export class TwilioProvider implements Provider {
  readonly name = "twilio";
  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string,
  ) {}

  async send(msg: NotificationMessage): Promise<DeliveryResult> {
    if (!msg.to) {
      throw new Error("twilio requires recipient phone number");
    }
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const body = new URLSearchParams({
      To: msg.to,
      From: this.fromNumber,
      Body: msg.body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${credentials}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(`twilio ${res.status}: ${await res.text()}`);
    }
    const out = (await res.json()) as { sid: string; date_created: string };
    return {
      messageId: out.sid,
      timestamp: out.date_created,
      raw: out,
    };
  }
}

// ─── Registry + init ──────────────────────────────────────────────────────

export interface ProviderEnv {
  OFP_PROVIDER_EMAIL?: string;
  OFP_PROVIDER_SMS?: string;
  OFP_SENDGRID_API_KEY?: string;
  SENDGRID_FROM?: string;
  OFP_TWILIO_ACCOUNT_SID?: string;
  OFP_TWILIO_AUTH_TOKEN?: string;
  OFP_TWILIO_FROM?: string;
}

/**
 * Process-singleton. Both api and worker call `initProviders(process.env)`
 * once at startup. Tests call `.inject()` to substitute stubs without
 * touching the actual process env.
 */
class RegistryImpl {
  private _email: Provider | null = null;
  private _sms: Provider | null = null;

  getEmail(): Provider {
    return this._email ?? new StubProvider();
  }
  getSms(): Provider {
    return this._sms ?? new StubProvider();
  }
  inject(email: Provider | null, sms: Provider | null): void {
    this._email = email;
    this._sms = sms;
  }
  reset(): void {
    this._email = null;
    this._sms = null;
  }
  /** Diagnostic: what the registry will hand out for each channel. */
  describe(): { email: string; sms: string } {
    return { email: this.getEmail().name, sms: this.getSms().name };
  }
}

export const ProviderRegistry = new RegistryImpl();

function createEmailProvider(env: ProviderEnv): Provider {
  const choice = env.OFP_PROVIDER_EMAIL ?? "stub";
  if (choice === "sendgrid") {
    if (!env.OFP_SENDGRID_API_KEY) {
      throw new Error(
        "OFP_PROVIDER_EMAIL=sendgrid requires OFP_SENDGRID_API_KEY",
      );
    }
    return new SendgridProvider(env.OFP_SENDGRID_API_KEY, env.SENDGRID_FROM);
  }
  if (choice === "stub") return new StubProvider();
  throw new Error(`unknown email provider: ${choice}`);
}

function createSmsProvider(env: ProviderEnv): Provider {
  const choice = env.OFP_PROVIDER_SMS ?? "stub";
  if (choice === "twilio") {
    if (
      !env.OFP_TWILIO_ACCOUNT_SID ||
      !env.OFP_TWILIO_AUTH_TOKEN ||
      !env.OFP_TWILIO_FROM
    ) {
      throw new Error(
        "OFP_PROVIDER_SMS=twilio requires OFP_TWILIO_ACCOUNT_SID + OFP_TWILIO_AUTH_TOKEN + OFP_TWILIO_FROM",
      );
    }
    return new TwilioProvider(
      env.OFP_TWILIO_ACCOUNT_SID,
      env.OFP_TWILIO_AUTH_TOKEN,
      env.OFP_TWILIO_FROM,
    );
  }
  if (choice === "stub") return new StubProvider();
  throw new Error(`unknown sms provider: ${choice}`);
}

/**
 * Read the provided env and overwrites the registry. Idempotent — call
 * again with new env to swap.
 */
export function initProviders(env: ProviderEnv): void {
  ProviderRegistry.inject(
    createEmailProvider(env),
    createSmsProvider(env),
  );
}
