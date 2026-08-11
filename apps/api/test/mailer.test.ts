// Runnable check (no DB, no network): node --import tsx --test test/mailer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSmtpConfig, sendEmail, type SmtpConfig } from "../src/mailer.ts";

const CONFIG: SmtpConfig = { host: "smtp.example.test", port: 587, secure: false, user: "noreply@example.test", pass: "s3cret", from: "OpenFieldPro <noreply@example.test>" };

test("resolveSmtpConfig fails closed when SMTP is not fully configured", () => {
  assert.equal(resolveSmtpConfig({}), null);
  assert.equal(resolveSmtpConfig({ SMTP_HOST: "smtp.example.test" }), null);
  assert.equal(resolveSmtpConfig({ SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "" }), null);
  assert.equal(resolveSmtpConfig({ SMTP_HOST: "  ", SMTP_USER: "u", SMTP_PASS: "p" }), null);
});

test("resolveSmtpConfig reads the environment with defaults", () => {
  const config = resolveSmtpConfig({ SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "p" });
  assert.deepEqual(config, { host: "smtp.example.test", port: 587, secure: false, user: "u", pass: "p", from: "u" });
  const withOverrides = resolveSmtpConfig({
    SMTP_HOST: "mail.example.test",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "u",
    SMTP_PASS: "p",
    SMTP_FROM: "OpenFieldPro <u@example.test>",
  });
  assert.deepEqual(withOverrides, { host: "mail.example.test", port: 465, secure: true, user: "u", pass: "p", from: "OpenFieldPro <u@example.test>" });
});

test("sendEmail returns null without attempting a send when SMTP is unconfigured", async () => {
  let called = false;
  const fake = { sendMail: async () => { called = true; return {}; } } as never;
  const result = await sendEmail({ to: "c@example.test", subject: "s", text: "t" }, { transport: fake, config: null });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("sendEmail delivers the message through the transport", async () => {
  const sent: Array<Record<string, string>> = [];
  const fake = {
    sendMail: async (mail: Record<string, string>) => {
      sent.push(mail);
      return { messageId: "m1", accepted: ["c@example.test"] };
    },
  } as never;
  const result = await sendEmail(
    { to: "c@example.test", subject: "Your portal link", text: "Hello" },
    { transport: fake, config: CONFIG },
  );
  assert.deepEqual(result, { messageId: "m1", accepted: ["c@example.test"] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "OpenFieldPro <noreply@example.test>");
  assert.equal(sent[0].to, "c@example.test");
  assert.equal(sent[0].subject, "Your portal link");
  assert.equal(sent[0].text, "Hello");
});
