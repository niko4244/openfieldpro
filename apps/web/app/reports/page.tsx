"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { ArAgingReport, EstimateConversionReport, RevenueTrendReport, ReportSummaryDTO, TechnicianScorecardsReport } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const AR_LABELS: Record<string, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

async function downloadCsv(report: string, params: { days?: number; months?: number } = {}) {
  const { blob, filename } = await api.reportCsv(report, params);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
  const [arAging, setArAging] = useState<ArAgingReport | null>(null);
  const [conversion, setConversion] = useState<EstimateConversionReport | null>(null);
  const [trend, setTrend] = useState<RevenueTrendReport | null>(null);
  const [scorecards, setScorecards] = useState<TechnicianScorecardsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [r, aging, conv, rev, scores] = await Promise.all([
          api.reports(),
          api.arAging(),
          api.estimateConversion(),
          api.revenueTrend(),
          api.technicianScorecards(),
        ]);
        if (!cancelled) {
          setData(r);
          setArAging(aging);
          setConversion(conv);
          setTrend(rev);
          setScorecards(scores);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

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

          {/* Wave 3 #4: AR aging, estimate conversion, revenue trend, scorecards */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Accounts Receivable Aging</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => void downloadCsv("ar-aging").catch(() => {})}>Download CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                {arAging && arAging.invoiceCount === 0 ? (
                  <p className="text-sm text-fg-muted">No outstanding balances.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {arAging?.buckets.map((bucket) => (
                        <div key={bucket.label} className="flex items-center justify-between rounded-lg bg-surface-200 px-3 py-2">
                          <span className="text-xs text-fg-muted">{AR_LABELS[bucket.label] ?? bucket.label}</span>
                          <span className="text-sm font-semibold text-fg tabular-nums">
                            {bucket.count} · {formatMoney(bucket.totalCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <span className="text-xs text-fg-muted">Total outstanding ({arAging?.invoiceCount ?? 0} invoices)</span>
                      <span className="text-sm font-bold text-fg tabular-nums">{formatMoney(arAging?.totalOutstandingCents ?? 0)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Estimate Conversion</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => void downloadCsv("estimate-conversion", { days: 90 }).catch(() => {})}>Download CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-end gap-3">
                  <div className="text-3xl font-bold text-fg tabular-nums">
                    {conversion ? Math.round(conversion.conversionRate * 100) : 0}%
                  </div>
                  <p className="pb-1 text-xs text-fg-muted">approved of sent · last 90 days</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Sent", value: conversion?.sent ?? 0 },
                    { label: "Approved", value: conversion?.approved ?? 0 },
                    { label: "Declined", value: conversion?.declined ?? 0 },
                    { label: "Expired", value: conversion?.expired ?? 0 },
                  ].map((row) => (
                    <div key={row.label} className="rounded-lg bg-surface-200 p-3 text-center">
                      <div className="text-lg font-bold text-fg tabular-nums">{row.value}</div>
                      <div className="text-[11px] text-fg-muted">{row.label}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-fg-muted">
                  {conversion?.avgDaysToApprove === null || conversion?.avgDaysToApprove === undefined
                    ? "No approvals yet in this window."
                    : `Average time from sent to approval: ${conversion.avgDaysToApprove} days.`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Revenue Trend</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => void downloadCsv("revenue-trend", { months: 12 }).catch(() => {})}>Download CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {trend?.months.map((point) => {
                    const max = Math.max(1, ...trend.months.map((m) => m.revenueCents));
                    const pct = (point.revenueCents / max) * 100;
                    return (
                      <div key={point.month} className="flex items-center gap-3">
                        <span className="w-16 text-xs text-fg-muted tabular-nums shrink-0">{point.month}</span>
                        <div className="h-4 flex-1 rounded-full bg-surface-300 overflow-hidden">
                          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(pct > 0 ? 6 : 0, pct)}%` }} />
                        </div>
                        <span className="w-20 text-xs text-fg-muted text-right tabular-nums shrink-0">{formatMoney(point.revenueCents)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-fg-muted">Total ({trend?.months.length ?? 0} months)</span>
                  <span className="text-sm font-bold text-fg tabular-nums">{formatMoney(trend?.totalRevenueCents ?? 0)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Technician Scorecards</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => void downloadCsv("technician-scorecards", { days: 90 }).catch(() => {})}>Download CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                {!scorecards || scorecards.scorecards.length === 0 ? (
                  <p className="text-sm text-fg-muted">No completed jobs in the last 90 days.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-fg-muted">
                          <th className="py-2 pr-3">Technician</th>
                          <th className="py-2 pr-3 text-right">Jobs</th>
                          <th className="py-2 pr-3 text-right">Revenue</th>
                          <th className="py-2 pr-3 text-right">Rating</th>
                          <th className="py-2 text-right">On-time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scorecards.scorecards.map((scorecard) => (
                          <tr key={scorecard.technicianId ?? "unassigned"} className="border-b border-border/60">
                            <td className="py-2 pr-3 text-fg font-medium">{scorecard.technicianName}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{scorecard.jobsCompleted}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(scorecard.revenueCents)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{scorecard.avgRating === null ? "—" : scorecard.avgRating.toFixed(1)}</td>
                            <td className="py-2 text-right tabular-nums">{scorecard.onTimeRate === null ? "—" : `${Math.round(scorecard.onTimeRate * 100)}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
