"use client";

import { useState, useTransition } from "react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function PublicInvoiceCheckoutButton({ token, paid }: { token: string; paid: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(paid ? "Invoice paid." : null);

  function checkout() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`${BASE}/api/public/invoices/${token}/checkout`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `checkout failed (${res.status})`);
        if (!body.url) throw new Error("payment link unavailable");
        window.location.href = body.url;
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <div className="action-panel">
      <button className="button primary" disabled={pending || paid} onClick={checkout}>
        {pending ? "Opening…" : paid ? "Paid" : "Pay invoice"}
      </button>
      {message && <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>}
    </div>
  );
}
