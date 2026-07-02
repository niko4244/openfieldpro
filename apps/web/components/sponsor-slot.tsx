"use client";

// The free tier's sponsor slot: a single, honest, non-tracking house ad.
// A Pro license (Settings → General → Plan) sets org.plan = "pro" and this
// renders nothing. ponytail: static self-promo content only; no ad network,
// no tracking. Ceiling: rotating sponsor messages from a static JSON file.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

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
