"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { JobDTO, CustomerDTO } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface LineItem {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

interface Payment {
  id: string;
  orgId: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
}

interface InvoiceDetail {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
  dueAt?: string | null;
  createdAt?: string;
  lineItems: LineItem[];
  payments: Payment[];
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  manual: "Manual",
  card: "Card",
  cash: "Cash",
  check: "Check",
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // ── Action states ──
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState<string | null>(null);

  // ── Confirm dialog ──
  const [confirmAction, setConfirmAction] = useState<"sent" | "paid" | "void" | null>(null);

  // ── Payment modal ──
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("manual");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // ── Escape key handler for dialogs ──
  useEffect(() => {
    if (!confirmAction && !showPayment) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmAction(null);
        setShowPayment(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmAction, showPayment]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [inv, jb, cust] = await Promise.all([
          api.invoice(invoiceId),
          api.jobs().catch(() => [] as JobDTO[]),
          api.customers().catch(() => [] as CustomerDTO[]),
        ]);
        if (!cancelled) {
          setInvoice(inv);
          setJobs(jb);
          setCustomers(cust);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [invoiceId]);

  const job = useMemo(
    () => (invoice ? jobs.find((j) => j.id === invoice.jobId) : null),
    [invoice, jobs],
  );
  const customer = useMemo(
    () => (job ? customers.find((c) => c.id === job.customerId) : null),
    [job, customers],
  );

  const totalPaid = invoice
    ? invoice.payments.reduce((sum, p) => sum + p.amount, 0)
    : 0;
  const remaining = invoice ? invoice.total - totalPaid : 0;

  // ── Status actions ──
  const handleStatusChange = async (status: "sent" | "void") => {
    if (!invoice) return;
    setSubmittingStatus(status);
    setActionError(null);
    try {
      const result = await api.updateInvoiceStatus(invoice.id, status);
      setInvoice((prev) => prev ? { ...prev, status: result.status as InvoiceDetail["status"] } : prev);
      setConfirmAction(null);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setSubmittingStatus(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!invoice || remaining <= 0) return;
    setSubmittingStatus("paid");
    setActionError(null);
    try {
      await api.recordPayment(invoice.id, {
        amount: remaining,
        method: "manual",
      });
      const refreshed = await api.invoice(invoiceId);
      setInvoice(refreshed);
      setConfirmAction(null);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setSubmittingStatus(null);
    }
  };

  // ── Record payment ──
  const openPayment = () => {
    setPayAmount(String(Math.max(0, remaining / 100)));
    setPayMethod("manual");
    setPayError(null);
    setShowPayment(true);
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const cents = Math.round(parseFloat(payAmount || "0") * 100);
    if (cents <= 0) return;
    setPaySubmitting(true);
    setPayError(null);
    try {
      await api.recordPayment(invoice.id, {
        amount: cents,
        method: payMethod,
      });
      // Refresh full invoice to get updated payments list
      const refreshed = await api.invoice(invoiceId);
      setInvoice(refreshed);
      setShowPayment(false);
      setPayAmount("");
    } catch (e) {
      setPayError(String(e));
    } finally {
      setPaySubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <div className="flex flex-col gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Confirm dialog backdrop + modal */}
      {confirmAction && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
              <div className="p-6">
                <h3 className="text-base font-semibold text-fg mb-2">
                  {confirmAction === "sent" ? "Mark as Sent?" : confirmAction === "paid" ? "Mark as Paid?" : "Void this invoice?"}
                </h3>
                <p className="text-sm text-fg-muted mb-4">
                  {confirmAction === "sent"
                    ? `This will mark invoice ${invoice?.number} as sent to the customer.`
                    : confirmAction === "paid"
                    ? `Record a payment of ${formatMoney(Math.max(0, remaining))} on invoice ${invoice?.number} and mark it as paid.`
                    : `This will void invoice ${invoice?.number}. This cannot be undone.`}
                </p>
                {actionError && (
                  <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{actionError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => confirmAction === "paid" ? handleMarkPaid() : handleStatusChange(confirmAction as "sent" | "void")}
                    disabled={submittingStatus !== null}
                    variant={confirmAction === "void" ? "danger" : "default"}
                  >
                    {submittingStatus === confirmAction
                      ? (confirmAction === "void" ? "Voiding..." : confirmAction === "paid" ? "Paying..." : "Sending...")
                      : (confirmAction === "void" ? "Yes, void it" : confirmAction === "paid" ? "Yes, record payment" : "Yes, mark as sent")}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmAction(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Payment modal */}
      {showPayment && invoice && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPayment(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
              <form
                onSubmit={(e) => { e.preventDefault(); handleRecordPayment(); }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Record Payment</h3>
                  <button
                    type="button"
                    onClick={() => setShowPayment(false)}
                    className="text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>

                {payError && (
                  <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{payError}</p>
                )}

                <p className="text-xs text-fg-muted mb-3">
                  Invoice {invoice.number} · {formatMoney(invoice.total)} total · {formatMoney(Math.max(0, remaining))} remaining
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                      Amount ($) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                      Method
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                    >
                      <option value="manual">Manual</option>
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button type="submit" disabled={paySubmitting || !payAmount}>
                    {paySubmitting ? "Recording..." : "Record Payment"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowPayment(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {/* ── Header ── */}
      {loadFailed ? (
        <PageHeader title="Couldn't load invoice" description={`ID: ${invoiceId}`} />
      ) : !invoice ? (
        <PageHeader title="Invoice not found" description={`No invoice with id ${invoiceId}.`} />
      ) : (
        <PageHeader
          title={invoice.number}
          description={
            <span className="inline-flex items-center gap-2">
              <InvoiceStatusBadge status={invoice.status} />
              {job && (
                <>
                  <span className="text-fg-dim">·</span>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-fg-link hover:text-fg transition-colors"
                  >
                    {job.title}
                  </Link>
                </>
              )}
              {customer && (
                <>
                  <span className="text-fg-dim">·</span>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-fg-muted hover:text-fg transition-colors"
                  >
                    {customer.name}
                  </Link>
                </>
              )}
            </span>
          }
          actions={
            <div className="flex gap-2 flex-wrap">
              {invoice.status === "draft" && (
                <Button size="sm" onClick={() => setConfirmAction("sent")}>
                  Mark as Sent
                </Button>
              )}
              {(invoice.status === "draft" || invoice.status === "sent") && (
                <Button size="sm" variant="danger" onClick={() => setConfirmAction("void")}>
                  Void
                </Button>
              )}
              {(invoice.status === "draft" || invoice.status === "sent") && remaining > 0 && (
                <Button size="sm" onClick={() => setConfirmAction("paid")}>
                  Mark as Paid
                </Button>
              )}
              {(invoice.status === "draft" || invoice.status === "sent" || (invoice.status === "paid" && remaining > 0)) && (
                <Button size="sm" variant="secondary" onClick={openPayment}>
                  Record Payment
                </Button>
              )}
              {job && (
                <Link href={`/jobs/${job.id}`}>
                  <Button variant="secondary" size="sm">View job</Button>
                </Link>
              )}
            </div>
          }
        />
      )}

      {!invoice ? (
        <Card>
          <EmptyState
            title="No invoice data"
            description="Verify the invoice ID or check your API connection"
          />
        </Card>
      ) : (
        <>
          {/* Status action bar */}
          {actionError && !confirmAction && (
            <Card className="mb-4 border-red/30 bg-red/5">
              <div className="flex items-center justify-between p-3">
                <p className="text-red text-sm">{actionError}</p>
                <button
                  onClick={() => setActionError(null)}
                  className="text-fg-muted hover:text-fg cursor-pointer bg-transparent border-none"
                >
                  ✕
                </button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="flex flex-col gap-6">
              {/* Invoice details */}
              <Card>
                <CardHeader>
                  <CardTitle>Invoice details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">Status</span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">Total</span>
                      <span className="text-sm font-bold text-fg tabular-nums">
                        {formatMoney(invoice.total)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">Paid</span>
                      <span className="text-sm font-semibold text-green tabular-nums">
                        {formatMoney(totalPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">Remaining</span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          remaining <= 0 ? "text-green" : "text-yellow"
                        }`}
                      >
                        {formatMoney(Math.max(0, remaining))}
                      </span>
                    </div>
                    {invoice.dueAt && (
                      <div className="flex justify-between items-center pt-3 border-t border-border">
                        <span className="text-xs text-fg-muted">Due date</span>
                        <span className="text-sm text-fg">
                          {new Date(invoice.dueAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                    {invoice.createdAt && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-fg-muted">Created</span>
                        <span className="text-sm text-fg">
                          {new Date(invoice.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Job & customer links */}
              {(job || customer) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Related</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {job && (
                        <div>
                          <p className="text-xs text-fg-muted mb-1">Job</p>
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-sm font-medium text-fg-link hover:text-fg transition-colors"
                          >
                            {job.title}
                          </Link>
                        </div>
                      )}
                      {customer && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-fg-muted mb-1">Customer</p>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="text-sm font-medium text-fg-link hover:text-fg transition-colors"
                          >
                            {customer.name}
                          </Link>
                          {customer.email && (
                            <p className="text-xs text-fg-dim mt-1">{customer.email}</p>
                          )}
                          {customer.phone && (
                            <p className="text-xs text-fg-dim">{customer.phone}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-6">
              {/* Line items */}
              <Card>
                <CardHeader>
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>
                    {invoice.lineItems.length === 0
                      ? "No items"
                      : `${invoice.lineItems.length} item${invoice.lineItems.length !== 1 ? "s" : ""}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {invoice.lineItems.length === 0 ? (
                    <p className="text-sm text-fg-muted py-4 text-center">
                      No line items on this invoice.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {invoice.lineItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-200"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-fg truncate">{item.description}</p>
                            <p className="text-xs text-fg-dim mt-0.5">
                              {item.quantity} × {formatMoney(item.unitPrice)}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-fg tabular-nums shrink-0 ml-3">
                            {formatMoney(item.quantity * item.unitPrice)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-2 px-3 mt-1 rounded-lg bg-accent/5 border border-accent/20">
                        <span className="text-sm font-medium text-fg">Total</span>
                        <span className="text-sm font-bold text-fg tabular-nums">
                          {formatMoney(invoice.total)}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payments */}
              <Card>
                <CardHeader>
                  <CardTitle>Payments</CardTitle>
                  <CardDescription>
                    {invoice.payments.length === 0
                      ? "No payments yet"
                      : `${invoice.payments.length} payment${invoice.payments.length !== 1 ? "s" : ""}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {invoice.payments.length === 0 ? (
                    <p className="text-sm text-fg-muted py-4 text-center">
                      No payments recorded for this invoice.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {invoice.payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface-200"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-green tabular-nums">
                              +{formatMoney(p.amount)}
                            </span>
                            <span className="text-xs text-fg-muted capitalize">
                              {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                            </span>
                          </div>
                          <span className="text-xs text-fg-dim">
                            {new Date(p.paidAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
