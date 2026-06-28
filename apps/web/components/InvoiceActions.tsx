"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendInvoice } from "../lib/client-api";

function Status({ message }: { message: string | null }) {
  if (!message) return null;
  const error = message.startsWith("Error:");
  return <p className={error ? "notice error" : "notice success"}>{message}</p>;
}

export function SendInvoiceButton({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const disabled = pending || status === "paid" || status === "void" || status === "sent";

  function send() {
    setMessage(null);
    startTransition(async () => {
      try {
        const invoice = await sendInvoice(invoiceId);
        setMessage(`Invoice ${invoice.number} marked sent.`);
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <div className="action-panel">
      <button className="button primary" disabled={disabled} onClick={send}>{pending ? "Sending…" : status === "sent" ? "Already sent" : "Mark sent"}</button>
      <Status message={message} />
    </div>
  );
}
