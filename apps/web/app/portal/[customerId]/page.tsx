import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/status-badge";
import { SponsorSlot } from "@/components/sponsor-slot";

export default async function CustomerPortalPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const [customer, jobs, invoices, org] = await Promise.all([
    api.customer(customerId).catch(() => null),
    api.jobs().catch(() => []),
    api.invoices().catch(() => []),
    api.org().catch(() => null),
  ]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);
  const customerJobIds = new Set(customerJobs.map((job) => job.id));
  const customerInvoices = invoices.filter((invoice) => customerJobIds.has(invoice.jobId));
  const openInvoices = customerInvoices.filter((invoice) => invoice.status === "sent" || invoice.status === "draft");
  const paidInvoices = customerInvoices.filter((invoice) => invoice.status === "paid");

  return (
    <main className="min-h-screen bg-surface-100 text-fg">
      <header className="border-b border-border bg-surface-50">
        <div className="mx-auto flex h-16 w-[min(1080px,calc(100%-32px))] items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-3 text-fg no-underline hover:no-underline">
            <span className="ofp-brand-mark h-9 w-9 text-xs">OF</span>
            <span className="font-bold tracking-tight">OpenFieldPro Portal</span>
          </Link>
          <span className="text-xs text-fg-muted">Customer view scaffold</span>
        </div>
      </header>

      <div className="mx-auto w-[min(1080px,calc(100%-32px))] py-8">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.22em] text-accent font-bold">Customer portal</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-fg">
            {customer?.name ?? "Customer portal"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            This portal surface is ready for estimate approvals, invoice payments, appointment visibility, service-plan status, receipts, and review requests.
          </p>
        </div>

        {org?.businessSettings.portal.showSponsorSlot ? <SponsorSlot /> : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-fg-dim">Open invoices</p>
            <p className="mt-2 text-3xl font-black text-fg">{openInvoices.length}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {formatMoney(openInvoices.reduce((sum, invoice) => sum + invoice.total, 0))} awaiting payment
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-fg-dim">Paid invoices</p>
            <p className="mt-2 text-3xl font-black text-fg">{paidInvoices.length}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {formatMoney(paidInvoices.reduce((sum, invoice) => sum + invoice.total, 0))} collected
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-fg-dim">Service history</p>
            <p className="mt-2 text-3xl font-black text-fg">{customerJobs.length}</p>
            <p className="mt-1 text-sm text-fg-muted">jobs connected to this customer</p>
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-base font-semibold text-fg">Recent service</h2>
            {customerJobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">No service history available yet.</p>
            ) : (
              <div className="grid gap-2">
                {customerJobs.slice(0, 6).map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-lg bg-surface-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{job.title}</p>
                      <p className="text-xs text-fg-muted">{new Date(job.createdAt).toLocaleDateString()}</p>
                    </div>
                    <JobStatusBadge status={job.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-fg">Invoices</h2>
            {customerInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">No invoices available yet.</p>
            ) : (
              <div className="grid gap-2">
                {customerInvoices.slice(0, 6).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between rounded-lg bg-surface-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-fg">Invoice {invoice.number}</p>
                      <p className="text-xs capitalize text-fg-muted">{invoice.status}</p>
                    </div>
                    <p className="text-sm font-semibold text-fg">{formatMoney(invoice.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-6 border-accent/30 bg-accent/5">
          <h2 className="text-base font-semibold text-fg">Next portal integrations</h2>
          <div className="mt-3 grid gap-2 text-sm text-fg-muted md:grid-cols-2">
            <p>✓ Estimate approval surface</p>
            <p>✓ Invoice payment link surface</p>
            <p>✓ Service-plan status card</p>
            <p>✓ Review request flow</p>
          </div>
        </Card>
      </div>
    </main>
  );
}
