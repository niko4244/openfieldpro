import Link from "next/link";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { formatMoney } from "@ofp/shared";
import type { ActivityDTO, ReportSummaryDTO } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { JobStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default async function DashboardOverview() {
  // Fetch all data in parallel, degrade gracefully on failures
  const [jobsResult, summaryResult, activitiesResult, appointmentsResult, invoicesResult, customersResult] =
    await Promise.allSettled([
      api.jobs(),
      api.reports(),
      api.activities(),
      api.appointments(),
      api.invoices(),
      api.customers(),
    ]);

  const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
  const summary: ReportSummaryDTO | null =
    summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const activities: ActivityDTO[] =
    activitiesResult.status === "fulfilled" ? activitiesResult.value : [];
  const appointments =
    appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const invoices =
    invoicesResult.status === "fulfilled" ? invoicesResult.value : [];
  const customers =
    customersResult.status === "fulfilled" ? customersResult.value : [];

  const apiDown = jobsResult.status === "rejected";
  const apiError = apiDown
    ? ((jobsResult as PromiseRejectedResult).reason as Error)?.message
    : null;

  // ── Computed metrics ──
  const scheduled = jobs.filter((j) => j.status === "scheduled").length;
  const inProgress = jobs.filter((j) => j.status === "in_progress").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const activeJobs = inProgress + scheduled;
  const revenue = jobs
    .filter((j) => j.status === "completed")
    .reduce((a, j) => a + j.total, 0);
  const outstandingInvoices = invoices
    .filter((i) => i.status === "sent" || i.status === "draft")
    .reduce((a, i) => a + i.total, 0);

  // Upcoming appointments (next 5, future only)
  const now = new Date();
  const upcoming = appointments
    .filter((a) => new Date(a.startsAt) > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);

  // Activity feed (last 10 items)
  const feed = activities.slice(0, 10);

  // Revenue trend (approximate: compare last 7 days)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentRevenue = jobs
    .filter((j) => j.status === "completed" && new Date(j.createdAt) > oneWeekAgo)
    .reduce((a, j) => a + j.total, 0);

  return (
    <div>
      {/* ── Header ── */}
      <PageHeader
        title="Dashboard"
        description={
          apiDown
            ? "API unreachable — data unavailable"
            : `${jobs.length} jobs · ${formatMoney(revenue)} collected · ${customers.length} customers`
        }
        actions={
          <div className="flex gap-2">
            <Link href="/customers">
              <Button variant="secondary" size="sm">
                <span className="text-base mr-1">+</span> New Customer
              </Button>
            </Link>
            <Link href="/schedule">
              <Button variant="default" size="sm">
                <span className="text-base mr-1">⊕</span> New Job
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── API error banner ── */}
      {apiError && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <div className="flex items-center gap-3">
            <span className="text-red font-bold">⚠</span>
            <div>
              <p className="text-sm text-red font-medium">API unreachable</p>
              <p className="text-xs text-fg-muted mt-0.5">
                {apiError}. Start it with{" "}
                <code className="text-fg-dim">pnpm dev:api</code> and seed with{" "}
                <code className="text-fg-dim">pnpm db:seed</code>
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Stat cards ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 mb-8">
        <StatCard
          label="Active jobs"
          value={String(activeJobs)}
          icon="◈"
          href="/schedule"
          color={activeJobs > 0 ? "#7ab8ff" : undefined}
        />
        <StatCard
          label="Completed"
          value={String(completed)}
          icon="✓"
          color={completed > 0 ? "#86e29a" : undefined}
        />
        <StatCard
          label="Revenue"
          value={formatMoney(revenue)}
          icon="⛁"
          color="#86e29a"
          trend={
            recentRevenue > 0
              ? {
                  direction: "up" as const,
                  label: `${formatMoney(recentRevenue)} this week`,
                }
              : undefined
          }
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstandingInvoices)}
          icon="◎"
          href="/invoices"
          color={outstandingInvoices > 0 ? "#e0b34f" : undefined}
        />
        <StatCard
          label="Customers"
          value={String(customers.length)}
          icon="⊕"
          href="/customers"
          color={customers.length > 0 ? "#7ab8ff" : undefined}
        />
        {summary && (
          <StatCard
            label="Realized margin"
            value={formatMoney(summary.realizedMarginCents)}
            icon="△"
            color={
              summary.realizedMarginCents < 0
                ? "#ff8080"
                : summary.realizedMarginCents > 0
                  ? "#86e29a"
                  : "#e6e9f0"
            }
          />
        )}
      </div>

      {/* ── Two-column: Job status + Activity feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Job status breakdown */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-fg">Job status breakdown</h3>
            <span className="text-xs text-fg-dim">{jobs.length} total</span>
          </div>
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              description="Create your first job to start tracking work"
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {(
                ["lead", "scheduled", "in_progress", "completed", "canceled"] as const
              ).map((status) => {
                const count = jobs.filter((j) => j.status === status).length;
                const pct = jobs.length > 0 ? (count / jobs.length) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <JobStatusBadge status={status} />
                    <div className="flex-1 h-2 rounded-full bg-surface-400 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background:
                            status === "completed"
                              ? "linear-gradient(90deg, #86e29a, #4ade80)"
                              : status === "in_progress"
                                ? "linear-gradient(90deg, #e0b34f, #f59e0b)"
                                : status === "canceled"
                                  ? "linear-gradient(90deg, #ff8080, #ef4444)"
                                  : status === "scheduled"
                                    ? "linear-gradient(90deg, #7ab8ff, #3b82f6)"
                                    : "linear-gradient(90deg, #8a97c2, #6b7280)",
                        }}
                      />
                    </div>
                    <span className="text-xs text-fg-muted w-8 text-right tabular-nums">
                      {count}
                    </span>
                    <span className="text-xs text-fg-dim w-10 text-right tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Activity feed */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-fg">Recent activity</h3>
            <span className="text-xs text-fg-dim">{activities.length} events</span>
          </div>
          {feed.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Activity will appear as you create jobs and interact with customers"
            />
          ) : (
            <div className="relative pl-4 border-l-2 border-surface-400 space-y-3 max-h-[340px] overflow-y-auto">
              {feed.map((a) => {
                // Derive customer link: prefer direct customerId, fallback to job's customerId
                const activityCustomerId =
                  a.customerId ??
                  (a.jobId ? jobs.find((j) => j.id === a.jobId)?.customerId : undefined);
                const linkHref = activityCustomerId
                  ? `/customers/${activityCustomerId}`
                  : a.jobId
                    ? `/jobs/${a.jobId}`
                    : null;

                const content = (
                  <>
                    <div className="absolute -left-[25px] top-1.5 w-3 h-3 rounded-full bg-surface-500 border-2 border-surface-300 group-hover:bg-accent transition-colors" />
                    <p className="text-sm text-fg leading-snug">{a.summary}</p>
                    <p className="text-xs text-fg-dim mt-1">
                      {formatRelativeTime(a.createdAt)}
                    </p>
                  </>
                );

                return linkHref ? (
                  <Link
                    key={a.id}
                    href={linkHref}
                    className="relative group block hover:bg-surface-400/30 rounded-md -mx-1 px-1 py-1 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={a.id} className="relative group">
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Two-column: Upcoming appointments + Margins ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Upcoming appointments */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-fg">Upcoming appointments</h3>
            <Link
              href="/schedule"
              className="text-xs text-fg-link hover:text-fg transition-colors"
            >
              View all →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Schedule a job to see it here"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((a) => {
                const job = jobs.find((j) => j.id === a.jobId);
                const start = new Date(a.startsAt);
                const day = start.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                const time = start.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const isToday =
                  new Date().toDateString() === start.toDateString();

                return (
                  <Link
                    key={a.id}
                    href={`/jobs/${a.jobId}`}
                    className="flex items-center gap-4 p-3 rounded-lg bg-surface-200 hover:bg-surface-400 transition-colors"
                  >
                    <div
                      className={`flex flex-col items-center min-w-14 px-2 py-1 rounded-md text-center ${
                        isToday ? "bg-accent/20" : "bg-surface-400/50"
                      }`}
                    >
                      <span
                        className={`text-xs font-semibold ${
                          isToday ? "text-blue" : "text-fg-muted"
                        }`}
                      >
                        {day}
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          isToday ? "text-blue" : "text-fg"
                        }`}
                      >
                        {time}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">
                        {job?.title ?? a.jobId.slice(0, 8)}
                      </p>
                      {isToday && (
                        <p className="text-xs text-blue font-medium mt-0.5">Today</p>
                      )}
                    </div>
                    <span className="text-fg-dim text-lg shrink-0">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        {/* Margins card */}
        {summary ? (
          <Card>
            <h3 className="text-sm font-semibold text-fg mb-4">Margins</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-fg-muted">Realized (completed)</span>
                <span
                  className="text-lg font-bold"
                  style={{
                    color:
                      summary.realizedMarginCents < 0
                        ? "#ff8080"
                        : summary.realizedMarginCents > 0
                          ? "#86e29a"
                          : "#e6e9f0",
                  }}
                >
                  {formatMoney(summary.realizedMarginCents)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-fg-muted">Pipeline (in-flight)</span>
                <span
                  className="text-lg font-bold"
                  style={{
                    color:
                      summary.pipelineMarginCents < 0
                        ? "#ff8080"
                        : summary.pipelineMarginCents > 0
                          ? "#86e29a"
                          : "#e6e9f0",
                  }}
                >
                  {formatMoney(summary.pipelineMarginCents)}
                </span>
              </div>
              {summary.rating.count > 0 && (
                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <span className="text-xs text-fg-muted">Average rating</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-yellow text-sm">
                      {"★".repeat(Math.round(summary.rating.average))}
                      {"☆".repeat(5 - Math.round(summary.rating.average))}
                    </span>
                    <span className="text-sm font-semibold text-fg">
                      {summary.rating.average.toFixed(1)}
                    </span>
                    <span className="text-xs text-fg-dim">
                      · {summary.rating.count} review{summary.rating.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState title="No report data" description="Reports will appear once jobs start completing" />
          </Card>
        )}
      </div>

      {/* ── Recent jobs ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-fg">Recent jobs</h3>
          <Link
            href="/customers"
            className="text-xs text-fg-link hover:text-fg transition-colors"
          >
            View all →
          </Link>
        </div>
        {jobs.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            description="Create your first job from the Schedule page"
          />
        ) : (
          <div className="flex flex-col gap-1">
            {jobs.slice(0, 10).map((j) => {
              const customer = customers.find((c) => c.id === j.customerId);
              return (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-surface-400/50 transition-all duration-150 group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <JobStatusBadge status={j.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg truncate group-hover:text-fg transition-colors">
                        {j.title}
                      </p>
                      {customer && (
                        <p className="text-xs text-fg-dim mt-0.5 truncate">
                          {customer.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="text-sm text-fg-muted tabular-nums">
                      {formatMoney(j.total)}
                    </span>
                    <span className="text-fg-dim text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
