"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { DispatchStateDTO } from "@ofp/shared";
import { DispatchMap } from "@/components/dispatch-map";

const POLL_MS = 30_000;

export function DispatchBoard() {
  const [state, setState] = useState<DispatchStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const s = await api.fetchDispatchState();
        if (!cancelled) {
          setState(s);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? "Unable to load dispatch state");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (loading && !state) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-[560px] w-full rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <Card>
        <EmptyState title="Dispatch board unavailable" description={error} />
      </Card>
    );
  }

  if (!state) return null;

  const liveCount = state.techs.filter((t) => t.freshness === "live").length;
  const recentCount = state.techs.filter((t) => t.freshness === "recent").length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Dispatch</h1>
          <p className="text-sm text-fg-muted">
            Live technician GPS and today's upcoming jobs. Refreshes every 30 s.
          </p>
        </div>
        <div className="text-right text-xs text-fg-dim">
          {state.generatedAt
            ? `Snapshot ${new Date(state.generatedAt).toLocaleTimeString()}`
            : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Techs Live" value={liveCount} accent="green" />
        <SummaryTile label="Techs Recent" value={recentCount} accent="amber" />
        <SummaryTile label="Jobs Today" value={state.jobs.length} accent="accent" />
      </div>

      <DispatchMap techs={state.techs} jobs={state.jobs} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-fg mb-3">Technicians</h2>
            {state.techs.length === 0 ? (
              <EmptyState title="No technicians yet" description="Add a tech in Settings to see them here." />
            ) : (
              <ul className="divide-y divide-border">
                {state.techs.map((t) => (
                  <li key={t.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="text-fg">{t.name}</p>
                      <p className="text-xs text-fg-dim">
                        {t.lastLocation
                          ? new Date(t.lastLocation.capturedAt).toLocaleTimeString()
                          : "—"}
                      </p>
                    </div>
                    <FreshnessPill tier={t.freshness} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-fg mb-3">Today's jobs</h2>
            {state.jobs.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="Today is clear." />
            ) : (
              <ul className="divide-y divide-border">
                {state.jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="text-fg">{j.title}</p>
                      <p className="text-xs text-fg-dim">
                        {new Date(j.startsAt).toLocaleTimeString()} · {j.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: number; accent: "green" | "amber" | "accent" }) {
  const ringColor =
    accent === "green" ? "ring-green/40" : accent === "amber" ? "ring-amber/40" : "ring-accent/40";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-fg-dim">{label}</p>
        <p className={`text-3xl font-semibold text-fg tabular-nums mt-1 ring-1 ${ringColor} inline-block px-3 py-1 rounded`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function FreshnessPill({ tier }: { tier: "live" | "recent" | "stale" | "dead" }) {
  const map: Record<typeof tier, { bg: string; label: string }> = {
    live: { bg: "bg-green/15 text-green", label: "Live" },
    recent: { bg: "bg-amber/15 text-amber", label: "Recent" },
    stale: { bg: "bg-fg-dim/15 text-fg-muted", label: "Stale" },
    dead: { bg: "bg-fg-dim/10 text-fg-dim", label: "Offline" },
  };
  const m = map[tier];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${m.bg}`}>{m.label}</span>
  );
}
