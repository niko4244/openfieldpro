import Link from "next/link";
import { api, type PortalSessionDTO } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SponsorSlot } from "@/components/sponsor-slot";
import { PayButton } from "./pay-button";

const VIEW_LABELS: Record<string, string> = {
  balance: "Balance",
  checkout: "Checkout",
  receipts: "Receipts",
  service_plans: "Service plans",
};

function UnavailableCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-surface-100 px-4 py-16 text-fg">
      <Card className="mx-auto max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">OpenFieldPro Portal</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-fg-muted">{message}</p>
      </Card>
    </main>
  );
}

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;

  let session: PortalSessionDTO | null = null;
  let failure: { title: string; message: string } | null = null;
  try {
    session = await api.portalSession(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const status = /^4\d\d:/.test(message) ? Number(message.slice(0, 3)) : 0;
    if (status === 410) {
      const body = message.includes("revoked")
        ? "This portal link has been revoked by the service company. Please contact them for a new link."
        : message.includes("disabled")
          ? "The service company has turned off the customer portal. Please contact them for assistance."
          : "This portal link has expired. Please contact the service company for a new link.";
      failure = { title: "This portal link is no longer active", message: body };
    } else {
      failure = {
        title: "This portal link is unavailable",
        message: "Check that you copied the full link, or ask the service company for a new secure portal link. No customer or billing information has been displayed.",
      };
    }
  }

  if (failure) return <UnavailableCard title={failure.title} message={failure.message} />;
  if (!session) {
    return (
      <UnavailableCard
        title="Portal could not be loaded"
        message="Something went wrong while loading your portal. Please try again in a moment."
      />
    );
  }

  const { org, customer, views, balance, checkout, receipts, servicePlans } = session;
  const showBalance = views.includes("balance");
  const showCheckout = views.includes("checkout");
  const showReceipts = views.includes("receipts");
  const showPlans = views.includes("service_plans");

  return (
    <main className="min-h-screen bg-surface-100 text-fg">
      <header className="border-b border-border bg-surface-50">
        <div className="mx-auto flex h-16 w-[min(1080px,calc(100%-32px))] items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="ofp-brand-mark h-9 w-9 text-xs">{org.name.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">{org.name}</p>
              <p className="text-xs text-fg-muted">Customer portal</p>
            </div>
          </div>
          <span className="text-xs text-fg-muted">Signed in as {customer.name}</span>
        </div>
      </header>

      <div className="mx-auto w-[min(1080px,calc(100%-32px))] py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight">Welcome, {customer.name.split(" ")[0]}</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Review what you owe, pay your balance, and see your service plan — all from one secure link.
          </p>
        </div>

        {paid === "1" ? (
          <div role="status" className="mb-6 rounded-xl border border-green/40 bg-green/10 p-4 text-sm text-green">
            Thank you — your payment was received. A receipt is available below.
          </div>
        ) : null}

        {org.sponsorEnabled ? <SponsorSlot /> : null}

        <nav aria-label="Portal sections" className="mb-6 flex flex-wrap gap-2">
          {views.map((view) => (
            <a
              key={view}
              href={`#${view}`}
              className="rounded-lg border border-border bg-surface-50 px-3 py-1.5 text-sm font-medium text-fg-link no-underline hover:bg-surface-200"
            >
              {VIEW_LABELS[view] ?? view}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-6">
          {showBalance ? (
            <Card id="balance">
              <CardHeader>
                <CardTitle>Invoice balance</CardTitle>
              </CardHeader>
              <CardContent>
                {balance.invoices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">You have no outstanding balance. 🎉</p>
                ) : (
                  <div className="grid gap-3">
                    {balance.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-200 p-4">
                        <div>
                          <p className="text-sm font-semibold">Invoice {invoice.number}</p>
                          <p className="text-xs text-fg-muted">
                            {formatMoney(invoice.total)} total · {formatMoney(invoice.paid)} paid
                            {invoice.dueAt ? ` · due ${new Date(invoice.dueAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <p className="text-base font-black">{formatMoney(invoice.remaining)} remaining</p>
                      </div>
                    ))}
                    <p className="text-right text-sm font-semibold">
                      Total remaining: <span className="text-base font-black">{formatMoney(balance.totalRemaining)}</span>
                    </p>
                  </div>
                )}
                <p className="mt-4 text-xs text-fg-dim">{balance.paymentInstructions}</p>
              </CardContent>
            </Card>
          ) : null}

          {showCheckout ? (
            <Card id="checkout">
              <CardHeader>
                <CardTitle>Checkout</CardTitle>
              </CardHeader>
              <CardContent>
                {balance.invoices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">Nothing to pay right now — you are all caught up.</p>
                ) : checkout.available ? (
                  <div className="grid gap-3">
                    {balance.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-200 p-4">
                        <div>
                          <p className="text-sm font-semibold">Invoice {invoice.number}</p>
                          <p className="text-xs text-fg-muted">Pay the remaining {formatMoney(invoice.remaining)} securely online.</p>
                        </div>
                        <PayButton token={token} invoiceId={invoice.id} number={invoice.number} remaining={invoice.remaining} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-surface-200 p-4">
                    <p className="text-sm font-medium">Online payment is not enabled for this business.</p>
                    <p className="mt-1 text-xs text-fg-muted">{balance.paymentInstructions}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {showReceipts ? (
            <Card id="receipts">
              <CardHeader>
                <CardTitle>Receipts</CardTitle>
              </CardHeader>
              <CardContent>
                {receipts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">No paid invoices yet.</p>
                ) : (
                  <div className="grid gap-3">
                    {receipts.map((receipt) => (
                      <div key={receipt.id} className="rounded-lg bg-surface-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Invoice {receipt.number}</p>
                          <p className="text-sm font-black text-green">{formatMoney(receipt.total)} paid</p>
                        </div>
                        <ul className="mt-2 grid gap-1">
                          {receipt.payments.map((payment, index) => (
                            <li key={index} className="flex justify-between text-xs text-fg-muted">
                              <span className="capitalize">{payment.method} payment · {new Date(payment.paidAt).toLocaleDateString()}</span>
                              <span>{formatMoney(payment.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {showPlans ? (
            <Card id="service_plans">
              <CardHeader>
                <CardTitle>Service plans</CardTitle>
              </CardHeader>
              <CardContent>
                {servicePlans.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">You do not have an active service plan.</p>
                ) : (
                  <div className="grid gap-3">
                    {servicePlans.map((plan) => (
                      <div key={plan.id} className="rounded-lg bg-surface-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{plan.planName}</p>
                          <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                            {plan.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-fg-muted">
                          {plan.visitsCompleted} of {plan.visitsIncluded} visits used
                          {plan.renewsAt ? ` · renews ${new Date(plan.renewsAt).toLocaleDateString()}` : ""}
                        </p>
                        {plan.nextVisit ? (
                          <p className="mt-1 text-xs text-fg-dim">
                            Next visit: {plan.nextVisit.title}
                            {plan.nextVisit.dueAt ? ` · ${new Date(plan.nextVisit.dueAt).toLocaleDateString()}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-fg-dim">
          Questions? Contact {org.name}
          {org.publicPhone ? ` · ${org.publicPhone}` : ""}
          {org.publicEmail ? ` · ${org.publicEmail}` : ""}.
        </footer>
      </div>
    </main>
  );
}
