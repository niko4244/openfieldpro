"use client";

import { useState, useTransition } from "react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function PublicEstimateAcceptButton({ token, accepted }: { token: string; accepted: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(accepted ? "Estimate accepted." : null);

  function accept() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`${BASE}/api/public/estimates/${token}/accept`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `accept failed (${res.status})`);
        setMessage("Estimate accepted. The business can now schedule your work.");
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <div className="action-panel">
      <button className="button primary" disabled={pending || accepted || message?.startsWith("Estimate accepted")} onClick={accept}>
        {pending ? "Accepting…" : accepted ? "Accepted" : "Accept estimate"}
      </button>
      {message && <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>}
    </div>
  );
}
