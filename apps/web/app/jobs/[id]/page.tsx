import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import { formatMoney } from "@ofp/shared";
import type { ActivityDTO, CustomerDTO, JobDTO } from "@ofp/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge, InvoiceStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

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
  unitPrice?: number;
  unitCost?: number;
  financialsRestricted?: boolean;
  createdAt: string;
}

function diagnosticTone(status: string) {
  if (["blocked", "escalated"].includes(status)) return "border-red/30 bg-red/5 text-red";
  if (["diagnosed", "completed"].includes(status)) return "border-green/30 bg-green/5 text-green";
  if (["workflow_ready", "testing"].includes(status)) return "border-blue/30 bg-blue/5 text-blue";
  return "border-yellow/30 bg-yellow/5 text-yellow";
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = await params;

  let currentUser;
  try {
    currentUser = await serverApi.me();
  } catch {
    return (
      <div>
        <PageHeader
          title="Work order unavailable"
          description="Sign in again before viewing customer or job information."
        />
        <Card className="border-yellow/30 bg-yellow/5">
          <CardContent className="py-10 text-center">
            <p className="font-semibold text-fg">Your session has expired</p>
            <Link href="/login" className="mt-5 inline-flex">
              <Button>Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isTechnician = currentUser.role === "technician";

  let job: JobDTO | null = null;
  try {
    job = await serverApi.job(jobId);
  } catch {
    return (
      <div>
        <PageHeader
          title="Work order unavailable"
          description="This work order does not exist or is not assigned to your account."
        />
        <Card>
          <EmptyState
            title="No job data"
            description="Return to your assigned jobs and choose an accessible work order."
          />
        </Card>
      </div>
    );
  }

  const [activities, appointments, customers, lineItems, diagnosticRows, invoices] =
    await Promise.all([
      serverApi.activities({ jobId }).catch(() => [] as ActivityDTO[]),
      serverApi.appointments().catch(() => [] as Appointment[]),
      serverApi.customers().catch(() => [] as CustomerDTO[]),
      serverApi.lineItems(jobId).catch(() => [] as LineItem[]),
      serverApi.diagnosticSessions({ jobId }).catch(() => [] as DiagnosticSessionListItem[]),
      isTechnician
        ? Promise.resolve([] as Invoice[])
        : serverApi.invoices().catch(() => [] as Invoice[]),
    ]);

  const customer = customers.find((item) => item.id === job.customerId) ?? null;
  const jobAppointments = appointments.filter((item) => item.jobId === jobId);
  const jobInvoices = invoices.filter((item) => item.jobId === jobId);
  const diagnostic = diagnosticRows[0] ?? null;

  return (
    <div data-testid={isTechnician ? "technician-job-detail" : "office-job-detail"}>
      <PageHeader
        title={job.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            {customer && (
              <>
                <span className="text-fg-dim">·</span>
                <Link href={`/customers/${customer.id}`} className="text-fg-link hover:text-fg">
                  {customer.name}
                </Link>
              </>
            )}
            {job.scheduledAt && (
              <>
                <span className="text-fg-dim">·</span>
                <span>
                  {new Date(job.scheduledAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {diagnostic ? (
              <Link href={`/diagnostics/${diagnostic.session.id}`}>
                <Button size="sm">Continue equipment record</Button>
              </Link>
            ) : (
              <Link href="/diagnostics/new">
                <Button size="sm">Add equipment record</Button>
              </Link>
            )}
            {customer && (
              <Link href={`/customers/${customer.id}`}>
                <Button variant="secondary" size="sm">Customer</Button>
              </Link>
            )}
            <Link href="/closeout">
              <Button variant="secondary" size="sm">
                {isTechnician ? "Field board" : "Closeout"}
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Job details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-200 p-4">
                <p className="text-xs text-fg-muted">Status</p>
                <div className="mt-2"><JobStatusBadge status={job.status} /></div>
              </div>
              {!isTechnician && (
                <div className="rounded-xl bg-surface-200 p-4">
                  <p className="text-xs text-fg-muted">Current total</p>
                  <p className="mt-2 text-xl font-bold text-fg">{formatMoney(job.total)}</p>
                </div>
              )}
              <div className="rounded-xl bg-surface-200 p-4">
                <p className="text-xs text-fg-muted">Created</p>
                <p className="mt-2 text-sm text-fg">
                  {new Date(job.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="rounded-xl bg-surface-200 p-4">
                <p className="text-xs text-fg-muted">Scheduled</p>
                <p className="mt-2 text-sm text-fg">
                  {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Not scheduled"}
                </p>
              </div>
              {job.description && (
                <div className="rounded-xl bg-surface-200 p-4 sm:col-span-2">
                  <p className="text-xs text-fg-muted">Customer complaint and access notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{job.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={diagnostic ? "border-accent/25" : "border-border"}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Optional equipment record</CardTitle>
                <CardDescription>
                  Technical evidence stays attached to this work order without replacing its status.
                </CardDescription>
              </div>
              {diagnostic && (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${diagnosticTone(diagnostic.session.status)}`}>
                  {diagnostic.session.status.replaceAll("_", " ")}
                </span>
              )}
            </CardHeader>
            <CardContent>
              {diagnostic ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface-200 p-4">
                    <p className="text-lg font-bold text-fg">
                      {[diagnostic.equipment.make, diagnostic.equipment.model].filter(Boolean).join(" ") || diagnostic.equipment.type}
                    </p>
                    <p className="mt-1 text-xs text-fg-muted">
                      {diagnostic.equipment.serialNumber
                        ? `Serial ${diagnostic.equipment.serialNumber}`
                        : "Serial number not recorded"}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-surface-200 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">Customer complaint</p>
                      <p className="mt-2 text-sm text-fg">
                        {diagnostic.session.customerComplaint || "Not recorded"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-200 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">Applicable workflow</p>
                      <p className="mt-2 text-sm text-fg">
                        {diagnostic.workflow?.name || "Coverage required"}
                      </p>
                    </div>
                  </div>
                  <Link href={`/diagnostics/${diagnostic.session.id}`}>
                    <Button>
                      {diagnostic.session.status === "completed"
                        ? "Review equipment record"
                        : "Open equipment workflow"}
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <p className="font-semibold text-fg">No equipment record is attached</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    Add one when model, serial, measurements, or technical evidence are useful.
                  </p>
                  <Link href="/diagnostics/new" className="mt-4 inline-flex">
                    <Button size="sm">Add equipment record</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Activity</CardTitle>
              <span className="text-xs text-fg-dim">{activities.length}</span>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-muted">No activity yet for this job.</p>
              ) : (
                <div className="relative space-y-4 border-l-2 border-surface-400 pl-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="relative">
                      <div className="absolute -left-[25px] top-1 h-3 w-3 rounded-full border-2 border-surface-300 bg-surface-500" />
                      <p className="text-sm text-fg">{activity.summary}</p>
                      <p className="mt-0.5 text-xs text-fg-dim">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {customer && (
            <Card>
              <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Link href={`/customers/${customer.id}`} className="font-semibold text-fg-link">
                  {customer.name}
                </Link>
                {customer.email && <p className="text-xs text-fg-muted">{customer.email}</p>}
                {customer.phone && <p className="text-xs text-fg-muted">{customer.phone}</p>}
                <p className="border-t border-border pt-3 text-xs text-fg-dim">
                  Customer since {new Date(customer.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
              <CardDescription>
                {jobAppointments.length
                  ? `${jobAppointments.length} appointment${jobAppointments.length === 1 ? "" : "s"}`
                  : "Not yet scheduled"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobAppointments.length === 0 ? (
                isTechnician ? (
                  <p className="py-4 text-center text-sm text-fg-muted">
                    No appointment is currently attached to this assigned job.
                  </p>
                ) : (
                  <Link href="/schedule">
                    <Button variant="secondary" size="sm" className="w-full">
                      Schedule this job
                    </Button>
                  </Link>
                )
              ) : (
                <div className="space-y-2">
                  {jobAppointments.map((appointment) => (
                    <div key={appointment.id} className="rounded-lg bg-surface-200 p-3">
                      <p className="text-sm font-semibold text-fg">
                        {new Date(appointment.startsAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-fg-dim">
                        to {new Date(appointment.endsAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {!isTechnician && (
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>
                  {jobInvoices.length
                    ? `${jobInvoices.length} invoice${jobInvoices.length === 1 ? "" : "s"}`
                    : "No invoices yet"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {jobInvoices.length === 0 ? (
                  <p className="py-4 text-center text-sm text-fg-muted">
                    Create the invoice from Job Closeout after pricing is complete.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {jobInvoices.map((invoice) => (
                      <Link
                        key={invoice.id}
                        href={`/invoices/${invoice.id}`}
                        className="flex items-center justify-between rounded-lg bg-surface-200 p-3 no-underline hover:bg-surface-300"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-fg-link">{invoice.number}</span>
                          <InvoiceStatusBadge status={invoice.status} />
                        </div>
                        <span className="text-sm text-fg-muted">{formatMoney(invoice.total)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{isTechnician ? "Parts and work recorded" : "Line items"}</CardTitle>
              <CardDescription>
                {lineItems.length
                  ? `${lineItems.length} item${lineItems.length === 1 ? "" : "s"}`
                  : "No items yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-fg-muted">
                  No line items are attached to this work order.
                </p>
              ) : (
                <div className="space-y-2">
                  {lineItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-surface-200 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{item.description}</p>
                        <p className="mt-0.5 text-xs text-fg-dim">
                          Quantity {item.quantity}
                          {!isTechnician && item.unitPrice !== undefined
                            ? ` × ${formatMoney(item.unitPrice)}`
                            : ""}
                        </p>
                      </div>
                      {!isTechnician && item.unitPrice !== undefined && (
                        <span className="ml-3 shrink-0 text-sm font-semibold text-fg">
                          {formatMoney(item.quantity * item.unitPrice)}
                        </span>
                      )}
                    </div>
                  ))}
                  {!isTechnician && (
                    <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent/5 p-3">
                      <span className="text-sm font-medium text-fg">Job total</span>
                      <span className="text-sm font-bold text-fg">{formatMoney(job.total)}</span>
                    </div>
                  )}
                  {isTechnician && (
                    <p className="pt-2 text-xs text-fg-dim">
                      Pricing and cost information are handled by the office after field handoff.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
