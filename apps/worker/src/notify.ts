// Pluggable notification sink. Defaults to console; posts to an ntfy topic if
// NTFY_URL is set. Email/SMS providers can be added behind this interface.
export async function notify(title: string, message: string): Promise<void> {
  const url = process.env.NTFY_URL;
  if (url) {
    try {
      await fetch(url, { method: "POST", headers: { Title: title }, body: message });
      return;
    } catch (e) {
      console.error(`[notify] ntfy failed: ${(e as Error).message}`);
    }
  }
  console.log(`[notify] ${title} — ${message}`);
}
