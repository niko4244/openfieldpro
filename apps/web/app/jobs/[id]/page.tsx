import Link from "next/link";
import { api } from "@/lib/server-api";
import { formatMoney } from "@ofp/shared";
import type { ActivityDTO, CustomerDTO, JobDTO } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge, InvoiceStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { JobPhotos } from "./job-photos";

export const dynamic = "force-dynamic";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface Invoice {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
}

interface LineItem {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = await params;

  // Fetch job, activities, and all appointments/invoices in parallel
  let job: JobDTO | null = null;
  let jobLoadFailed = false;
  try {
    job = await api.job(jobId);
  } catch {
    jobLoadFailed = true;
  }

  const [activities, appointments, invoices, customers, lineItems, users] = await Promise.all([
    api.activities({ jobId }).catch(() => [] as ActivityDTO[]),
    api.appointments().catch(() => [] as Appointment[]),
    api.invoices().catch(() => [] as Invoice[]),
    api.customers().catch(() => [] as CustomerDTO[]),
    api.lineItems(jobId).catch(() => [] as LineItem[]),
    api.users().catch(() => []),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const customer = job ? customers.find((c) => c.id === job.customerId) : null;
  const jobAppointments = appointments.filter((a) => a.jobId === jobId);
  const jobInvoices = invoices.filter((i) => i.jobId === jobId);

  return (
    <div>
      {/* ── Header ── */}
      {jobLoadFailed ? (
        <PageHeader
          title="Couldn't load job"
          description={`ID: ${jobId}`}
        />
      ) : !job ? (
        <PageHeader
          title="Job not found"
          description={`No job with id ${jobId} in this org.`}
        />
      ) : (
        <PageHeader
          title={job.title}
          description={
            <span className="inline-flex items-center gap-2">
              <JobStatusBadge status={job.status} />
              {customer && (
                <>
                  <span className="text-fg-dim">·</span>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-fg-link hover:text-fg transition-colors"
                  >
                    {customer.name}
                  </Link>
                </>
              )}
              {job.scheduledAt && (
                <>
                  <span className="text-fg-dim">·</span>
                  <span>
                    {new Date(job.scheduledAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </>
              )}
            </span>
          }
          actions={
            <div className="flex gap-2">
              {customer && (
                <Link href={`/customers/${customer.id}`}>
                  <Button variant="secondary" size="sm">View customer</Button>
                </Link>
              )}
              <Link href="/jobs?new=1">
                <Button variant="default" size="sm">
                  <span className="text-base mr-1">⊕</span> New Job
                </Button>
              </Link>
            </div>
          }
        />
      )}

      {!job ? (
        <Card>
          <EmptyState
            title="No job data"
            description="Verify the job ID or check your API connection"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left column ── */}
          <div className="flex flex-col gap-6">
            {/* Job details */}
            <Card>
              <CardHeader>
                <CardTitle>Job details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-fg-muted">Status</span>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-fg-muted">Total</span>
                    <span className="text-sm font-semibold text-fg tabular-nums">
                      {formatMoney(job.total)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-fg-muted">Created</span>
                    <span className="text-sm text-fg">
                      {new Date(job.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  {job.scheduledAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">Scheduled</span>
                      <span className="text-sm text-fg">
                        {new Date(job.scheduledAt).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {customer && (
                    <div className="flex justify-between items-center pt-3 border-t border-border">
                      <span className="text-xs text-fg-muted">Customer</span>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-sm text-fg-link hover:text-fg transition-colors"
                      >
                        {customer.name}
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Activity timeline */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Activity</CardTitle>
                <span className="text-xs text-fg-dim">{activities.length}</span>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-sm text-fg-muted py-6 text-center">
                    No activity yet for this job.
                  </p>
                ) : (
                  <div className="relative pl-4 border-l-2 border-surface-400 space-y-4">
                    {activities.map((a) => (
                      <div key={a.id} className="relative">
                        <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-surface-500 border-2 border-surface-300" />
                        <p className="text-sm text-fg">{a.summary}</p>
                        <p className="text-xs text-fg-dim mt-0.5">
                          {new Date(a.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-6">
            {/* Customer card */}
            {customer && (
              <Card>
                <CardHeader>
                  <CardTitle>Customer</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-sm font-semibold text-fg-link hover:text-fg transition-colors"
                    >
                      {customer.name}
                    </Link>
                    {customer.email && (
                      <p className="text-xs text-fg-muted">{customer.email}</p>
                    )}
                    {customer.phone && (
                      <p className="text-xs text-fg-muted">{customer.phone}</p>
                    )}
                    <p className="text-xs text-fg-dim pt-1 border-t border-border">
                      Customer since{" "}
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Appointments */}
            <Card>
              <CardHeader>
                <CardTitle>Appointments</CardTitle>
                <CardDescription>
                  {jobAppointments.length === 0
                    ? "Not yet scheduled"
                    : `${jobAppointments.length} appointment${jobAppointments.length !== 1 ? "s" : ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {jobAppointments.length === 0 ? (
                  <Link href={`/schedule?jobId=${job.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Schedule this job
                    </Button>
                  </Link>
                ) : (
                  <div className="flex flex-col gap-2">
                    {jobAppointments.map((a) => {
                      const start = new Date(a.startsAt);
                      const end = new Date(a.endsAt);
                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-surface-200"
                        >
                          <div className="flex flex-col items-center min-w-14">
                            <span className="text-xs text-fg-muted">
                              {start.toLocaleDateString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-fg">
                              {start.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              –{" "}
                              {end.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            {a.technicianId && (
                              <p className="text-xs text-fg-dim mt-0.5">
                                Tech: {userMap.get(a.technicianId) ?? a.technicianId.slice(0, 8)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoices */}
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>
                  {jobInvoices.length === 0
                    ? "No invoices yet"
                    : `${jobInvoices.length} invoice${jobInvoices.length !== 1 ? "s" : ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {jobInvoices.length === 0 ? (
                  <p className="text-sm text-fg-muted py-4 text-center">
                    No invoices for this job.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {jobInvoices.map((inv) => (
                      <Link
                        key={inv.id}
                        href={`/invoices/${inv.id}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface-200 hover:bg-surface-400 transition-colors no-underline"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fg-link">
                            {inv.number}
                          </span>
                          <InvoiceStatusBadge status={inv.status} />
                        </div>
                        <span className="text-sm text-fg-muted tabular-nums">
                          {formatMoney(inv.total)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>
                  {lineItems.length === 0
                    ? "No items yet"
                    : `${lineItems.length} item${lineItems.length !== 1 ? "s" : ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lineItems.length === 0 ? (
                  <p className="text-sm text-fg-muted py-4 text-center">
                    No line items for this job.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {lineItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-200"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-fg truncate">{item.description}</p>
                          <p className="text-xs text-fg-dim mt-0.5">
                            {item.quantity} × {formatMoney(item.unitPrice)}
                            {item.unitCost > 0 && (
                              <span className="text-fg-dim"> · cost {formatMoney(item.unitCost)}/ea</span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-fg tabular-nums shrink-0 ml-3">
                          {formatMoney(item.quantity * item.unitPrice)}
                        </span>
                      </div>
                    ))}
                    {/* Totals row */}
                    <div className="flex items-center justify-between py-2 px-3 mt-1 rounded-lg bg-accent/5 border border-accent/20">
                      <span className="text-sm font-medium text-fg">Job Total</span>
                      <span className="text-sm font-bold text-fg tabular-nums">
                        {formatMoney(job.total)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Photos & Attachments */}
            <Card>
              <CardHeader>
                <CardTitle>Photos &amp; Attachments</CardTitle>
                <CardDescription>Job site photos and documents</CardDescription>
              </CardHeader>
              <CardContent>
                {/* ponytail: local-filesystem storage via @fastify/multipart.
                    Ceiling: single-server, no replication. Upgrade: swap uploads.ts
                    with an S3 client. */}
                <JobPhotos jobId={jobId} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
