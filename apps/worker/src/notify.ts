export type NotifyChannel = "email" | "sms" | "manual" | "app";

async function postJson(url: string, payload: unknown) {
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function notify(title: string, message: string, channel: NotifyChannel = "app"): Promise<void> {
  const payload = { title, message, channel };
  const emailUrl = process.env.EMAIL_WEBHOOK_URL;
  const smsUrl = process.env.SMS_WEBHOOK_URL;
  const ntfyUrl = process.env.NTFY_URL;

  try {
    if (channel === "email" && emailUrl) {
      await postJson(emailUrl, payload);
      return;
    }
    if (channel === "sms" && smsUrl) {
      await postJson(smsUrl, payload);
      return;
    }
    if (ntfyUrl) {
      await fetch(ntfyUrl, { method: "POST", headers: { Title: title }, body: message });
      return;
    }
  } catch (e) {
    console.error(`[notify] ${channel} delivery failed: ${(e as Error).message}`);
  }

  console.log(`[notify:${channel}] ${title} — ${message}`);
}
