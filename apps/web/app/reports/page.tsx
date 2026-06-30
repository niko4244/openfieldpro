"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { ReportSummaryDTO } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type Period = "7d" | "30d" | "90d" | "all";

const JOB_STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  canceled: "Canceled",
};

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-purple/15 text-purple",
  scheduled: "bg-blue/15 text-blue",
  in_progress: "bg-yellow/15 text-yellow",
  completed: "bg-green/15 text-green",
  canceled: "bg-red/15 text-red",
};

function StatCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <Card className={accent}>
      <CardContent className="p-4">
        <p className="text-xs text-fg-muted mb-1">{title}</p>
        <p className="text-2xl font-bold text-fg tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-fg-dim mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= full ? "text-yellow" : "text-surface-500"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // ponytail: period is client-side only for now; API always returns all-time
        // Ceiling: filter buttons don't refetch data
        // Upgrade: pass period as query param to /api/reports/summary?period=30d
        const r = await api.reports();
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const periodLabel = useMemo(() => {
    const labels: Record<Period, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" };
    return labels[period];
  }, [period]);

  const PERIODS: { value: Period; label: string }[] = [
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
    { value: "90d", label: "90d" },
    { value: "all", label: "All" },
  ];

  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reports" description="Business performance at a glance." />

      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {data && (
        <>
          {/* Period filter — client-side only until API supports period param */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <Button
                  key={p.value}
                  variant={period === p.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <span className="text-xs text-fg-dim">{periodLabel}</span>
          </div>

          {/* Top-level KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard
              title="Revenue Collected"
              value={formatMoney(data.revenueCollectedCents)}
              subtitle="Paid invoices"
            />
            <StatCard
              title="Accounts Receivable"
              value={formatMoney(data.accountsReceivableCents)}
              subtitle="Outstanding"
            />
            <StatCard
              title="Realized Margin"
              value={formatMoney(data.realizedMarginCents)}
              subtitle="Completed jobs"
              accent={data.realizedMarginCents >= 0 ? "border-l-4 border-l-green" : "border-l-4 border-l-red"}
            />
            <StatCard
              title="Pipeline Margin"
              value={formatMoney(data.pipelineMarginCents)}
              subtitle="All non-canceled"
              accent={data.pipelineMarginCents >= 0 ? "border-l-4 border-l-green" : "border-l-4 border-l-red"}
            />
          </div>

          {/* Margin chart — horizontal bar chart using marginByStatus snapshot */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Margin Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-fg-dim mb-3">
                Realized margin by pipeline stage
              </p>
              {/* ponytail: static snapshot from marginByStatus — no time-series bucket endpoint yet.
                  Ceiling: chart shows current snapshot only, no trend-over-time view.
                  Upgrade: add revenue-over-time bucketed endpoint and switch to line chart. */}
              <div className="flex flex-col gap-2">
                {(["lead", "scheduled", "in_progress", "completed", "canceled"] as const).map((status) => {
                  const val = (data.marginByStatus as Record<string, number>)[status] ?? 0;
                  const maxAbs = Math.max(
                    1,
                    ...Object.values(data.marginByStatus as Record<string, number>).map(Math.abs),
                  );
                  const width = maxAbs > 0 ? (Math.abs(val) / maxAbs) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="w-20 text-xs text-fg-muted shrink-0">
                        {JOB_STATUS_LABELS[status]}
                      </span>
                      <div className="flex-1 h-5 rounded bg-surface-300 overflow-hidden">
                        <div
                          className={`h-full rounded transition-all ${
                            val >= 0 ? "bg-green" : "bg-red"
                          }`}
                          style={{
                            width: `${Math.max(width, val !== 0 ? 1 : 0)}%`,
                            minWidth: val !== 0 ? "4px" : "0",
                          }}
                        />
                      </div>
                      <span
                        className={`w-24 text-xs text-right font-mono tabular-nums ${
                          val >= 0 ? "text-green" : "text-red"
                        }`}
                      >
                        {val >= 0 ? "+" : ""}{formatMoney(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline by status */}
            <Card>
              <CardHeader>
                <CardTitle>Pipeline by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {["lead", "scheduled", "in_progress", "completed", "canceled"].map((status) => {
                    const count = data.jobsByStatus[status as keyof typeof data.jobsByStatus] ?? 0;
                    const total = Object.values(data.jobsByStatus).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : "0";
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="w-24 text-xs text-fg-muted shrink-0">
                          {JOB_STATUS_LABELS[status] ?? status}
                        </span>
                        <div className="flex-1 h-4 rounded-full bg-surface-300 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${status === "completed" ? "bg-green" : status === "canceled" ? "bg-red" : status === "in_progress" ? "bg-yellow" : "bg-blue"}`}
                            style={{ width: `${pct}%`, minWidth: count > 0 ? "8px" : "0" }}
                          />
                        </div>
                        <span className="w-10 text-xs text-fg-muted text-right tabular-nums">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Margin by status */}
            <Card>
              <CardHeader>
                <CardTitle>Margin by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {["lead", "scheduled", "in_progress", "completed", "canceled"].map((status) => {
                    const margin = (data.marginByStatus as Record<string, number>)[status] ?? 0;
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <span className="text-xs text-fg-muted">
                          {JOB_STATUS_LABELS[status] ?? status}
                        </span>
                        <span
                          className={`text-sm font-mono tabular-nums font-semibold ${
                            margin >= 0 ? "text-green" : "text-red"
                          }`}
                        >
                          {margin >= 0 ? "+" : ""}{formatMoney(margin)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Ratings */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Rating</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-fg tabular-nums">
                    {data.rating.average.toFixed(1)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <RatingStars rating={data.rating.average} />
                    <p className="text-xs text-fg-muted">
                      Based on {data.rating.count} review{data.rating.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick summary */}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Total jobs", value: Object.values(data.jobsByStatus).reduce((a, b) => a + b, 0) },
                    { label: "Completed", value: data.jobsByStatus.completed ?? 0 },
                    { label: "Canceled", value: data.jobsByStatus.canceled ?? 0 },
                    { label: "Avg rating", value: `${data.rating.average.toFixed(1)} ⭐` },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">{row.label}</span>
                      <span className="text-sm text-fg font-semibold tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
