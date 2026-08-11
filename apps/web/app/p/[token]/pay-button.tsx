"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";

interface PayButtonProps {
  token: string;
  invoiceId: string;
  number: string;
  remaining: number;
}

export function PayButton({ token, invoiceId, number, remaining }: PayButtonProps) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setState("working");
    setError(null);
    try {
      const { url } = await api.portalCheckout(token, invoiceId);
      window.location.href = url;
    } catch (err) {
      let message = "Checkout could not be started. Please try again.";
      if (err instanceof Error) {
        try {
          const body = JSON.parse(err.message.slice(err.message.indexOf(":") + 1)) as { error?: string; hint?: string };
          if (body.error) message = body.error;
          if (body.hint) message = `${message} ${body.hint}`;
        } catch {
          message = err.message;
        }
      }
      setError(message);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={startCheckout}
        disabled={state === "working"}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-surface-50 transition-colors hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {state === "working" ? "Starting checkout…" : `Pay ${formatMoney(remaining)}`}
      </button>
      {state === "error" && error ? (          <p role="alert" className="max-w-xs text-right text-xs text-red">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-fg-dim">Invoice {number}</p>
    </div>
  );
}
