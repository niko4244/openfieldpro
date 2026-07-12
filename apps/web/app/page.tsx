import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import { formatMoney } from "@ofp/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/status-badge";
import { SponsorSlot } from "@/components/sponsor-slot";

function sessionTone(status: string) {
  if (status === "blocked") return "bg-yellow/10 text-yellow";
  if (status === "escalated") return "bg-red/10 text-red";
  if (["diagnosed", "completed"].includes(status)) return "bg-green/10 text-green";
  return "bg-blue/10 text-blue";
}

export default async function TodayPage() {
  let currentUser;
  try {
    currentUser = await serverApi.me();
  } catch {
    return (
      <div>
        <PageHeader
          title="Today"
          description="Sign in to open your assigned field-service workspace."
        />
        <Card className="border-yellow/30 bg-yellow/5">
          <CardContent className="py-10 text-center">
            <p className="font-semibold text-fg">Your session is unavailable or has expired</p>
            <p className="mt-2 text-sm text-fg-muted">Sign in again before viewing customer, job, schedule, or payment data.</p>
            <Link href="/login" className="mt-5 inline-flex">
              <Button>Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isTechnician = currentUser.role === "technician";
  const isOffice = !isTechnician;
  const [jobsResult, appointmentsResult, customersResult, invoicesResult] =
    await Promise.allSettled([
      serverApi.jobs(),
      serverApi.appointments(),
      serverApi.customers(),
      isOffice ? serverApi.invoices() : Promise.resolve([]),
    ]);

  const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
  const appointments = appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const customers = customersResult.status === "fulfilled" ? customersResult.value : [];
  const invoices = invoicesResult.status === "fulfilled" ? invoicesResult.value : [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const todayAppointments = appointments
    .filter((appointment) => {
      const starts = new Date(appointment.startsAt);
      return starts >= todayStart && starts < tomorrowStart;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  let diagnosticSessions: DiagnosticSessionListItem[] = [];
  if (isOffice) {
    try {
      diagnosticSessions = await serverApi.diagnosticSessions();
    } catch {
      diagnosticSessions = [];
    }
  } else {
    const routeJobIds = [...new Set(todayAppointments.map((appointment) => appointment.jobId))];
    const routeSessionResults = await Promise.allSettled(
      routeJobIds.map((jobId) => serverApi.diagnosticSessions({ jobId })),
    );
    diagnosticSessions = routeSessionResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  }

  const activeInvoiceJobIds = new Set(
    invoices.filter((invoice) => invoice.status !== "void").map((invoice) => invoice.jobId),
  );
  const unscheduledLeads = jobs.filter((job) => job.status === "lead");
  const inProgress = jobs.filter((job) => job.status === "in_progress");
  const completed = jobs.filter((job) => job.status === "completed");
  const readyToInvoice = jobs.filter(
    (job) => job.status === "completed" && job.total > 0 && !activeInvoiceJobIds.has(job.id),
  );
  const needsPricing = jobs.filter(
    (job) => job.status === "completed" && job.total === 0 && !activeInvoiceJobIds.has(job.id),
  );
  const officeAttention = [...inProgress, ...needsPricing, ...readyToInvoice];
  const fieldAttention = [...inProgress, ...completed];
  const closeoutAttention = isTechnician ? fieldAttention : officeAttention;
  const outstanding = invoices
    .filter((invoice) => invoice.status === "draft" || invoice.status === "sent")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const completedRevenue = jobs
    .filter((job) => job.status === "completed")
    .reduce((sum, job) => sum + job.total, 0);
  const activeDiagnostics = diagnosticSessions.filter((item) =>
    ["workflow_ready", "testing", "blocked", "escalated"].includes(item.session.status),
  );
  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
  const routeCustomerCount = new Set(
    todayAppointments
      .map((appointment) => jobs.find((job) => job.id === appointment.jobId)?.customerId)
      .filter((customerId): customerId is string => Boolean(customerId)),
  ).size;
  const apiDown =
    jobsResult.status === "rejected" ||
    appointmentsResult.status === "rejected" ||
    customersResult.status === "rejected" ||
    (isOffice && invoicesResult.status === "rejected");

  const stats: Array<[string, string | number, string]> = isTechnician
    ? [
        ["Today’s visits", todayAppointments.length, "text-blue"],
        ["Assigned jobs", jobs.length, "text-fg"],
        ["In progress", inProgress.length, inProgress.length ? "text-yellow" : "text-green"],
        ["Completed", completed.length, completed.length ? "text-green" : "text-fg"],
        ["Route customers", routeCustomerCount, "text-blue"],
      ]
    : [
        ["Today’s visits", todayAppointments.length, "text-blue"],
        ["Unscheduled leads", unscheduledLeads.length, unscheduledLeads.length ? "text-yellow" : "text-green"],
        ["In progress", inProgress.length, inProgress.length ? "text-yellow" : "text-green"],
        ["Ready to invoice", readyToInvoice.length, readyToInvoice.length ? "text-green" : "text-fg"],
        ["Outstanding", formatMoney(outstanding), outstanding ? "text-yellow" : "text-green"],
      ];

  return (
    <div>
      <PageHeader
        title="Today"
        description={
          isTechnician
            ? "Work your assigned visits, record field evidence, and hand completed jobs back to the office."
            : "Run today’s visits, dispatch open work, close completed jobs, and move approved work into payment."
        }
        actions={
          isTechnician ? (
            <Link href="/jobs">
              <Button size="sm">View assigned jobs</Button>
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link href="/jobs/new">
                <Button variant="secondary" size="sm">New job</Button>
              </Link>
              <Link href="/dispatch">
                <Button size="sm">Open dispatch</Button>
              </Link>
            </div>
          )
        }
      />

      {apiDown && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-red">Part of the operations workspace is unavailable</p>
            <p className="mt-1 text-xs text-fg-muted">Refresh the session or verify the API before relying on today’s workload.</p>
          </CardContent>
        </Card>
      )}

      <SponsorSlot />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(([label, value, tone]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Today’s route</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">Open the work order, review arrival notes, and continue any optional equipment record.</p>
            </div>
            <Link href={isTechnician ? "/jobs" : "/schedule"} className="text-xs text-fg-link">
              {isTechnician ? "Assigned jobs →" : "Full schedule →"}
            </Link>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="font-semibold text-fg">No appointments today</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {isTechnician
                    ? "No visit is assigned to your route today."
                    : "Unscheduled and return-visit work remains available in the jobs pipeline."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map((appointment) => {
                  const job = jobs.find((item) => item.id === appointment.jobId);
                  const session = diagnosticSessions.find((item) => item.session.jobId === appointment.jobId);
                  const starts = new Date(appointment.startsAt);
                  const ends = new Date(appointment.endsAt);
                  return (
                    <div key={appointment.id} className="rounded-xl border border-border bg-surface-200 p-4">
                      <div className="flex items-start gap-4">
                        <div className="min-w-20 rounded-lg bg-surface-100 px-3 py-2 text-center">
                          <p className="text-sm font-bold text-fg">
                            {starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </p>
                          <p className="text-[10px] text-fg-dim">
                            to {ends.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <Link href={`/jobs/${appointment.jobId}`} className="font-semibold text-fg-link">
                                {job?.title || "Service job"}
                              </Link>
                              {job && <div className="mt-1"><JobStatusBadge status={job.status} /></div>}
                            </div>
                            {session && (
                              <Link
                                href={`/diagnostics/${session.session.id}`}
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize no-underline ${sessionTone(session.session.status)}`}
                              >
                                optional record · {session.session.status.replaceAll("_", " ")}
                              </Link>
                            )}
                          </div>
                          <p className="mt-3 text-xs text-fg-muted">
                            {job ? customerMap.get(job.customerId) || "Customer unavailable" : "Work-order details unavailable"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{isTechnician ? "Field handoff" : "Closeout attention"}</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">
                {isTechnician
                  ? "Continue active work and confirm completed visits are ready for office follow-up."
                  : "Active work and completed visits that still need pricing or an invoice."}
              </p>
            </div>
            <Link href="/closeout" className="text-xs text-fg-link">
              {isTechnician ? "Field board →" : "Closeout board →"}
            </Link>
          </CardHeader>
          <CardContent>
            {closeoutAttention.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-fg-muted">
                {isTechnician ? "No assigned jobs require a field handoff." : "No jobs require closeout action."}
              </div>
            ) : (
              <div className="space-y-3">
                {closeoutAttention.slice(0, 7).map((job) => {
                  const officeLabel = job.status === "in_progress"
                    ? "In progress"
                    : job.total === 0
                      ? "Needs pricing"
                      : "Ready to invoice";
                  const label = isTechnician
                    ? job.status === "in_progress"
                      ? "In progress"
                      : "Completed · office handoff"
                    : officeLabel;
                  const tone = !isTechnician && job.total === 0 && job.status === "completed"
                    ? "border-red/25 bg-red/5 text-red"
                    : "border-border bg-surface-200 text-fg";
                  return (
                    <Link
                      key={job.id}
                      href={isTechnician ? `/jobs/${job.id}` : "/closeout"}
                      className={`block rounded-xl border p-4 no-underline hover:bg-surface-300 ${tone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{job.title}</p>
                          <p className="mt-1 text-xs text-fg-muted">{customerMap.get(job.customerId) || "Customer unavailable"}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
                          {!isTechnician && <p className="mt-1 text-sm font-bold">{formatMoney(job.total)}</p>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {isTechnician ? (
          <>
            <Card>
              <CardHeader><CardTitle>Assigned workload</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-fg-muted">Assigned jobs</span><span className="font-semibold text-fg">{jobs.length}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Today’s visits</span><span className="font-semibold text-blue">{todayAppointments.length}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Completed handoffs</span><span className="font-semibold text-green">{completed.length}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Next field action</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-fg-muted">
                  {inProgress.length
                    ? `${inProgress.length} assigned job${inProgress.length === 1 ? " is" : "s are"} currently in progress.`
                    : todayAppointments.length
                      ? "Open the next work order and review the customer complaint before arrival."
                      : completed.length
                        ? "Completed work is ready for office pricing and customer follow-up."
                        : "No immediate field action is waiting."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Route equipment records</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-fg-muted">
                  {activeDiagnostics.length} active equipment record{activeDiagnostics.length === 1 ? "" : "s"} is linked to today’s assigned route.
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle>Operations snapshot</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-fg-muted">Customers</span><span className="font-semibold text-fg">{customers.length}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Completed revenue</span><span className="font-semibold text-green">{formatMoney(completedRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Outstanding invoices</span><span className="font-semibold text-yellow">{formatMoney(outstanding)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Next office action</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-fg-muted">
                  {needsPricing.length
                    ? `${needsPricing.length} completed job${needsPricing.length === 1 ? "" : "s"} need pricing before invoicing.`
                    : readyToInvoice.length
                      ? `${readyToInvoice.length} completed job${readyToInvoice.length === 1 ? " is" : "s are"} ready to invoice.`
                      : unscheduledLeads.length
                        ? `${unscheduledLeads.length} lead${unscheduledLeads.length === 1 ? " needs" : "s need"} scheduling.`
                        : "No urgent office handoff is waiting."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Optional technical records</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-fg-muted">
                  {activeDiagnostics.length} active equipment record{activeDiagnostics.length === 1 ? "" : "s"}. Technical evidence stays attached to the commercial work order without replacing job status, billing, or customer history.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
