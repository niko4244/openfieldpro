"use client";

// The free tier's sponsor slot: one honest, clearly-labeled, non-tracking
// card. A Pro/Founder/Business license (Settings → General → Plan) hides it.
//
// Sponsor content is STATIC and LOCAL: the self-hosting admin may set
//   NEXT_PUBLIC_SPONSOR_NAME  — sponsor display name
//   NEXT_PUBLIC_SPONSOR_TEXT  — one-line message
//   NEXT_PUBLIC_SPONSOR_URL   — optional link
// at build time. No ad network, no remote script, no tracking pixel, no
// behavioral targeting — ever. Without config it falls back to a house line
// supporting the project. ponytail: env-only config; ceiling: rotating
// sponsors. Upgrade: a static JSON list the admin ships with the app.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const SPONSOR = {
  name: process.env.NEXT_PUBLIC_SPONSOR_NAME,
  text: process.env.NEXT_PUBLIC_SPONSOR_TEXT,
  url: process.env.NEXT_PUBLIC_SPONSOR_URL,
};

export function SponsorSlot() {
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.org().then((o) => {
      if (!cancelled) setPlan(o.plan);
    }).catch(() => {
      if (!cancelled) setPlan("free"); // fail open: never let an API blip hide the slot logic
    });
    return () => { cancelled = true; };
  }, []);

  if (plan !== "free") return null;

  if (SPONSOR.name) {
    const body = (
      <>
        <span className="font-semibold text-fg-muted">Sponsored by {SPONSOR.name}</span>
        {SPONSOR.text ? <> — {SPONSOR.text}</> : null}
      </>
    );
    return (
      <div className="mt-6 flex items-center justify-between gap-3 py-2.5 px-4 rounded-lg border border-dashed border-border bg-surface-100 text-xs text-fg-dim">
        <span>
          {SPONSOR.url ? (
            <a href={SPONSOR.url} target="_blank" rel="noreferrer sponsored" className="hover:underline">
              {body}
            </a>
          ) : (
            body
          )}
        </span>
        <Link href="/settings" className="shrink-0 text-accent hover:underline no-underline">
          Go Pro to remove →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center justify-between gap-3 py-2.5 px-4 rounded-lg border border-dashed border-border bg-surface-100 text-xs text-fg-dim">
      <span>
        OpenFieldPro is free &amp; open source — this space supports development.
      </span>
      <Link
        href="/settings"
        className="shrink-0 text-accent hover:underline no-underline"
      >
        Go Pro to remove →
      </Link>
    </div>
  );
}
