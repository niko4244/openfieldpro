"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { CustomerDTO, InvoiceStatus, JobDTO } from "@ofp/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceStatusBadge } from "@/components/status-badge";

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
  status: InvoiceStatus;
  total: number;
  dueAt?: string | null;
  createdAt?: string;
  lineItems: LineItem[];
  payments: Payment[];
}

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
}

const EMPTY_LINE: LineDraft = {
  description: "",
  quantity: "1",
  unitPrice: "",
  unitCost: "",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  manual: "Manual",
  card: "Card",
  cash: "Cash",
  check: "Check",
};

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function fromDateInput(value: string): string | null {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

function centsFromDollars(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function dollarsFromCents(value: number): string {
  return (value / 100).toFixed(2);
}

function lineToDraft(item: LineItem): LineDraft {
  return {
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: dollarsFromCents(item.unitPrice),
    unitCost: dollarsFromCents(item.unitCost),
  };
}

function draftToPayload(draft: LineDraft) {
  return {
    description: draft.description.trim(),
    quantity: Math.max(1, Math.round(Number(draft.quantity) || 1)),
    unitPrice: centsFromDollars(draft.unitPrice),
    unitCost: centsFromDollars(draft.unitCost),
  };
}

function formatShortDate(value?: string | null): string {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function previewAddress(customer: CustomerDTO | null): string {
  if (!customer) return "Customer details unavailable";
  return [customer.email, customer.phone].filter(Boolean).join(" | ") || "No contact on file";
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [dueDate, setDueDate] = useState("");
  const [newLine, setNewLine] = useState<LineDraft>(EMPTY_LINE);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<LineDraft>(EMPTY_LINE);

  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("manual");
  const [payReference, setPayReference] = useState("");

  const [sendChannel, setSendChannel] = useState<"email" | "text">("email");
  const [sendTo, setSendTo] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendMessage, setSendMessage] = useState("Thanks for choosing OpenFieldPro. You can review and pay your invoice online.");
  const [showServiceDetails, setShowServiceDetails] = useState(true);
  const [showLineDescriptions, setShowLineDescriptions] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [allowCard, setAllowCard] = useState(true);
  const [allowBank, setAllowBank] = useState(false);
  const [allowCashCheck, setAllowCashCheck] = useState(true);
  const [attachPhotos, setAttachPhotos] = useState(false);
  const [attachChecklist, setAttachChecklist] = useState(false);

  const refreshInvoice = async () => {
    const refreshed = await api.invoice(invoiceId);
    setInvoice(refreshed);
    setDueDate(toDateInput(refreshed.dueAt));
  };

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
          setDueDate(toDateInput(inv.dueAt));
          setJobs(jb);
          setCustomers(cust);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const job = useMemo(
    () => (invoice ? jobs.find((j) => j.id === invoice.jobId) ?? null : null),
    [invoice, jobs],
  );

  const customer = useMemo(
    () => (job ? customers.find((c) => c.id === job.customerId) ?? null : null),
    [job, customers],
  );

  useEffect(() => {
    if (!invoice) return;
    setSendSubject((current) => current || `Invoice ${invoice.number} from OpenFieldPro`);
  }, [invoice?.id, invoice?.number]);

  useEffect(() => {
    if (!customer) return;
    setSendTo((current) => current || customer.email || customer.phone || "");
  }, [customer?.id, customer?.email, customer?.phone]);

  const lineSubtotal = useMemo(
    () => invoice?.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ?? 0,
    [invoice],
  );

  const totalPaid = invoice?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const remaining = invoice ? Math.max(0, invoice.total - totalPaid) : 0;
  const displayLineSubtotal = invoice?.lineItems.length ? lineSubtotal : invoice?.total ?? 0;
  const totalMismatch = Boolean(invoice && invoice.lineItems.length > 0 && invoice.total !== lineSubtotal);
  const canEdit = Boolean(invoice && invoice.status !== "void" && invoice.status !== "paid");

  const paymentSummary = [
    allowCard ? "Card" : null,
    allowBank ? "ACH" : null,
    allowCashCheck ? "Cash/check" : null,
  ].filter(Boolean);

  const syncTotalAndRefresh = async () => {
    if (!invoice) return;
    await api.patchInvoice(invoice.id, { syncTotal: true });
    await refreshInvoice();
  };

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyAction(label);
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const saveDueDate = () =>
    runAction("due", async () => {
      if (!invoice) return;
      await api.patchInvoice(invoice.id, { dueAt: fromDateInput(dueDate) });
      await refreshInvoice();
      setNotice("Invoice due date updated.");
    });

  const addLineItem = () =>
    runAction("add-line", async () => {
      if (!invoice || !newLine.description.trim()) return;
      await api.createLineItem(invoice.jobId, draftToPayload(newLine));
      setNewLine(EMPTY_LINE);
      await syncTotalAndRefresh();
      setNotice("Line item added and invoice total refreshed.");
    });

  const saveLineItem = (itemId: string) =>
    runAction(`line-${itemId}`, async () => {
      if (!editingLine.description.trim()) return;
      await api.patchLineItem(itemId, draftToPayload(editingLine));
      setEditingLineId(null);
      setEditingLine(EMPTY_LINE);
      await syncTotalAndRefresh();
      setNotice("Line item updated.");
    });

  const removeLineItem = (itemId: string) =>
    runAction(`remove-${itemId}`, async () => {
      await api.deleteLineItem(itemId);
      await syncTotalAndRefresh();
      setNotice("Line item removed.");
    });

  const markStatus = (status: "sent" | "void") =>
    runAction(status, async () => {
      if (!invoice) return;
      await api.updateInvoiceStatus(invoice.id, status);
      await refreshInvoice();
      setNotice(status === "sent" ? "Invoice marked as sent." : "Invoice voided.");
    });

  const markInvoiceSent = () =>
    runAction("send", async () => {
      if (!invoice) return;
      await api.patchInvoice(invoice.id, { status: "sent", syncTotal: true });
      await refreshInvoice();
      setNotice("Invoice marked as sent. Delivery fields are preview-only until a delivery provider is configured.");
    });

  const markPaid = () =>
    runAction("paid", async () => {
      if (!invoice || remaining <= 0) return;
      await api.recordPayment(invoice.id, { amount: remaining, method: "manual" });
      await refreshInvoice();
      setNotice("Payment recorded and invoice marked paid.");
    });

  const openPayment = () => {
    setPayAmount(dollarsFromCents(remaining));
    setPayMethod("manual");
    setPayReference("");
    setShowPayment(true);
  };

  const recordPayment = () =>
    runAction("payment", async () => {
      if (!invoice) return;
      const amount = centsFromDollars(payAmount);
      if (amount <= 0) return;
      await api.recordPayment(invoice.id, {
        amount,
        method: payMethod,
        reference: payReference.trim() || undefined,
      });
      await refreshInvoice();
      setShowPayment(false);
      setNotice("Payment recorded.");
    });

  if (loading) {
    return (
      <div>
        <Skeleton className="h-10 w-72 mb-3" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_460px] gap-5">
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
          <Skeleton className="h-[680px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadFailed || !invoice) {
    return (
      <div>
        <PageHeader
          title={loadFailed ? "Could not load invoice" : "Invoice not found"}
          description={`ID: ${invoiceId}`}
        />
        <Card>
          <EmptyState title="No invoice data" description="Verify the invoice ID or check the API connection." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      {showPayment && (
        <>
          <button
            type="button"
            aria-label="Close payment dialog"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPayment(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <form
                className="p-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void recordPayment();
                }}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-fg">Record payment</h3>
                    <p className="text-xs text-fg-muted mt-1">
                      {invoice.number} has {formatMoney(remaining)} remaining.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPayment(false)}
                    className="h-9 w-9 rounded-md text-fg-muted hover:bg-surface-200 hover:text-fg"
                    aria-label="Close payment dialog"
                  >
                    x
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-fg-muted">Amount</span>
                    <Input
                      className="mt-1 font-mono tabular-nums"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={payAmount}
                      onChange={(event) => setPayAmount(event.target.value)}
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-fg-muted">Method</span>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      value={payMethod}
                      onChange={(event) => setPayMethod(event.target.value)}
                      style={{ colorScheme: "dark" }}
                    >
                      <option value="manual">Manual</option>
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-xs font-semibold text-fg-muted">Reference</span>
                    <Input
                      className="mt-1"
                      placeholder="Check number, terminal ID, note"
                      value={payReference}
                      onChange={(event) => setPayReference(event.target.value)}
                    />
                  </label>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button type="submit" disabled={busyAction === "payment" || centsFromDollars(payAmount) <= 0}>
                    {busyAction === "payment" ? "Recording..." : "Record payment"}
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

      <PageHeader
        title={invoice.number}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <span className="text-fg-dim">Balance {formatMoney(remaining)}</span>
            {job && (
              <Link href={`/jobs/${job.id}`} className="text-fg-link hover:text-fg">
                {job.title}
              </Link>
            )}
            {customer && <span className="text-fg-muted">{customer.name}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void markInvoiceSent()} disabled={busyAction === "send" || invoice.status === "void"}>
              {busyAction === "send" ? "Marking..." : "Mark sent"}
            </Button>
            {remaining > 0 && invoice.status !== "void" && (
              <Button size="sm" variant="secondary" onClick={openPayment}>
                Record payment
              </Button>
            )}
            {remaining > 0 && invoice.status !== "void" && (
              <Button size="sm" variant="secondary" onClick={() => void markPaid()} disabled={busyAction === "paid"}>
                Mark paid
              </Button>
            )}
            {invoice.status !== "void" && invoice.status !== "paid" && (
              <Button size="sm" variant="danger" onClick={() => void markStatus("void")} disabled={busyAction === "void"}>
                Void
              </Button>
            )}
          </div>
        }
      />

      {(notice || actionError || totalMismatch) && (
        <div className="mb-4 space-y-2">
          {notice && <div className="rounded-lg border border-green/20 bg-green/5 px-4 py-3 text-sm text-green">{notice}</div>}
          {actionError && <div className="rounded-lg border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">{actionError}</div>}
          {totalMismatch && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-yellow/30 bg-yellow/5 px-4 py-3">
              <p className="text-sm text-yellow">
                Invoice total is {formatMoney(invoice.total)}, but line items add up to {formatMoney(lineSubtotal)}.
              </p>
              <Button size="sm" variant="secondary" onClick={() => void syncTotalAndRefresh()}>
                Refresh total
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_460px] gap-5 items-start">
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Total" value={formatMoney(invoice.total)} />
            <Metric label="Paid" value={formatMoney(totalPaid)} tone="green" />
            <Metric label="Balance" value={formatMoney(remaining)} tone={remaining > 0 ? "yellow" : "green"} />
            <Metric label="Due" value={formatShortDate(invoice.dueAt)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Invoice details</CardTitle>
              <CardDescription>Set due terms and keep the invoice tied to the job record.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block md:col-span-1">
                  <span className="text-xs font-semibold text-fg-muted">Due date</span>
                  <Input
                    className="mt-1"
                    type="date"
                    value={dueDate}
                    disabled={!canEdit}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <div className="rounded-lg bg-surface-200 p-3">
                  <p className="text-xs text-fg-muted">Customer</p>
                  {customer ? (
                    <>
                      <Link href={`/customers/${customer.id}`} className="text-sm font-semibold text-fg-link hover:text-fg">
                        {customer.name}
                      </Link>
                      <p className="text-xs text-fg-dim mt-1">{previewAddress(customer)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-fg-muted">Customer unavailable</p>
                  )}
                </div>
                <div className="rounded-lg bg-surface-200 p-3">
                  <p className="text-xs text-fg-muted">Job</p>
                  {job ? (
                    <>
                      <Link href={`/jobs/${job.id}`} className="text-sm font-semibold text-fg-link hover:text-fg">
                        {job.title}
                      </Link>
                      <p className="text-xs text-fg-dim mt-1">Job total {formatMoney(job.total)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-fg-muted">Job unavailable</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={() => void saveDueDate()} disabled={!canEdit || busyAction === "due"}>
                  Save details
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void syncTotalAndRefresh()} disabled={invoice.status === "void"}>
                  Refresh from job
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Line items</CardTitle>
                <CardDescription>
                  Edit invoice services without leaving the preview.
                </CardDescription>
              </div>
              <span className="text-sm font-semibold text-fg tabular-nums">{formatMoney(displayLineSubtotal)}</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {invoice.lineItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fg-muted">
                    No itemized rows yet. The customer preview uses the current job total until items are added.
                  </div>
                ) : (
                  invoice.lineItems.map((item) => {
                    const editing = editingLineId === item.id;
                    return (
                      <div key={item.id} className="rounded-lg bg-surface-200 p-3">
                        {editing ? (
                          <LineEditor
                            draft={editingLine}
                            setDraft={setEditingLine}
                            disabled={busyAction === `line-${item.id}`}
                            onCancel={() => {
                              setEditingLineId(null);
                              setEditingLine(EMPTY_LINE);
                            }}
                            onSave={() => void saveLineItem(item.id)}
                          />
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-fg">{item.description}</p>
                              <p className="text-xs text-fg-muted mt-1">
                                {item.quantity} x {formatMoney(item.unitPrice)}
                                {item.unitCost > 0 ? ` | cost ${formatMoney(item.unitCost)}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold tabular-nums text-fg">
                                {formatMoney(item.quantity * item.unitPrice)}
                              </span>
                              {canEdit && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingLineId(item.id);
                                      setEditingLine(lineToDraft(item));
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void removeLineItem(item.id)}
                                    disabled={busyAction === `remove-${item.id}`}
                                  >
                                    Remove
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {canEdit && (
                <div className="mt-4 rounded-lg border border-border bg-surface-200/70 p-3">
                  <p className="text-xs font-semibold text-fg-muted mb-3">Add line item</p>
                  <LineEditor
                    draft={newLine}
                    setDraft={setNewLine}
                    disabled={busyAction === "add-line"}
                    saveLabel="Add item"
                    onSave={() => void addLineItem()}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer preview</CardTitle>
              <CardDescription>Preview the message, payment options, and visible invoice details before sending outside the app.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 rounded-lg bg-surface-200 p-1">
                    <button
                      type="button"
                      onClick={() => setSendChannel("email")}
                      className={`h-9 rounded-md text-sm font-medium ${sendChannel === "email" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"}`}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setSendChannel("text")}
                      className={`h-9 rounded-md text-sm font-medium ${sendChannel === "text" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"}`}
                    >
                      Text
                    </button>
                  </div>
                  <label className="block">
                    <span className="text-xs font-semibold text-fg-muted">To</span>
                    <Input className="mt-1" value={sendTo} onChange={(event) => setSendTo(event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-fg-muted">Subject</span>
                    <Input className="mt-1" value={sendSubject} onChange={(event) => setSendSubject(event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-fg-muted">Message</span>
                    <textarea
                      className="mt-1 min-h-28 w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      value={sendMessage}
                      onChange={(event) => setSendMessage(event.target.value)}
                    />
                  </label>
                </div>
                <div className="space-y-4">
                  <ToggleGroup title="Show on invoice">
                    <CheckRow checked={showServiceDetails} onChange={setShowServiceDetails} label="Service and job details" />
                    <CheckRow checked={showLineDescriptions} onChange={setShowLineDescriptions} label="Line item descriptions" />
                    <CheckRow checked={showPayments} onChange={setShowPayments} label="Payment history" />
                  </ToggleGroup>
                  <ToggleGroup title="Payment options">
                    <CheckRow checked={allowCard} onChange={setAllowCard} label="Credit card" />
                    <CheckRow checked={allowBank} onChange={setAllowBank} label="Bank transfer" />
                    <CheckRow checked={allowCashCheck} onChange={setAllowCashCheck} label="Cash or check" />
                  </ToggleGroup>
                  <ToggleGroup title="Attachments">
                    <CheckRow checked={attachPhotos} onChange={setAttachPhotos} label="Job photos" />
                    <CheckRow checked={attachChecklist} onChange={setAttachChecklist} label="Completion checklist" />
                  </ToggleGroup>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>
                {invoice.payments.length === 0 ? "No payments recorded" : `${invoice.payments.length} payment${invoice.payments.length === 1 ? "" : "s"} recorded`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoice.payments.length === 0 ? (
                <div className="rounded-lg bg-surface-200 p-5 text-center text-sm text-fg-muted">
                  No payments yet. Record payment when money arrives or mark the invoice paid.
                </div>
              ) : (
                <div className="space-y-2">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-green tabular-nums">+{formatMoney(payment.amount)}</p>
                        <p className="text-xs text-fg-muted">
                          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                          {payment.reference ? ` | ${payment.reference}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-fg-dim">{formatShortDate(payment.paidAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <InvoicePreview
          invoice={invoice}
          job={job}
          customer={customer}
          totalPaid={totalPaid}
          remaining={remaining}
          sendSubject={sendSubject}
          sendMessage={sendMessage}
          showServiceDetails={showServiceDetails}
          showLineDescriptions={showLineDescriptions}
          showPayments={showPayments}
          paymentSummary={paymentSummary}
          attachPhotos={attachPhotos}
          attachChecklist={attachChecklist}
        />
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "yellow" }) {
  const toneClass = tone === "green" ? "text-green" : tone === "yellow" ? "text-yellow" : "text-fg";
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </Card>
  );
}

function ToggleGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-200 p-3">
      <p className="text-xs font-semibold text-fg-muted mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CheckRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-md px-1 text-sm text-fg">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border bg-surface-300 text-accent focus-visible:ring-accent/50"
      />
    </label>
  );
}

function LineEditor({
  draft,
  setDraft,
  disabled,
  onSave,
  onCancel,
  saveLabel = "Save",
}: {
  draft: LineDraft;
  setDraft: (draft: LineDraft) => void;
  disabled?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_80px_110px_110px_auto] gap-2">
      <Input
        placeholder="Service, material, or labor"
        value={draft.description}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
      />
      <Input
        aria-label="Quantity"
        type="number"
        min="1"
        value={draft.quantity}
        onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
      />
      <Input
        aria-label="Unit price"
        type="number"
        min="0"
        step="0.01"
        placeholder="Price"
        value={draft.unitPrice}
        onChange={(event) => setDraft({ ...draft, unitPrice: event.target.value })}
      />
      <Input
        aria-label="Unit cost"
        type="number"
        min="0"
        step="0.01"
        placeholder="Cost"
        value={draft.unitCost}
        onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={disabled || !draft.description.trim()}>
          {saveLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function InvoicePreview({
  invoice,
  job,
  customer,
  totalPaid,
  remaining,
  sendSubject,
  sendMessage,
  showServiceDetails,
  showLineDescriptions,
  showPayments,
  paymentSummary,
  attachPhotos,
  attachChecklist,
}: {
  invoice: InvoiceDetail;
  job: JobDTO | null;
  customer: CustomerDTO | null;
  totalPaid: number;
  remaining: number;
  sendSubject: string;
  sendMessage: string;
  showServiceDetails: boolean;
  showLineDescriptions: boolean;
  showPayments: boolean;
  paymentSummary: (string | null)[];
  attachPhotos: boolean;
  attachChecklist: boolean;
}) {
  return (
    <aside className="xl:sticky xl:top-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border bg-surface-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-fg-muted">Customer preview</p>
              <h2 className="text-lg font-semibold text-fg">Invoice {invoice.number}</h2>
            </div>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>

        <div className="bg-surface-100 p-5">
          <div className="rounded-lg bg-white text-slate-900 shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">OpenFieldPro</p>
                  <p className="mt-1 text-sm text-slate-500">Field service invoice</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums">{formatMoney(remaining)}</p>
                  <p className="text-xs text-slate-500">Balance due</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Bill to</p>
                  <p className="font-medium">{customer?.name ?? "Customer"}</p>
                  <p className="text-slate-500">{previewAddress(customer)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Due</p>
                  <p className="font-medium">{formatShortDate(invoice.dueAt)}</p>
                  <p className="text-slate-500">{invoice.number}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm font-medium">{sendSubject || `Invoice ${invoice.number}`}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{sendMessage}</p>

              {showServiceDetails && job && (
                <div className="mt-5 rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Service</p>
                  <p className="mt-1 text-sm font-medium">{job.title}</p>
                  <p className="text-xs text-slate-500">Job #{job.id.slice(0, 8)}</p>
                </div>
              )}

              <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_72px_96px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Amount</span>
                </div>
                {invoice.lineItems.length === 0 ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_72px_96px] border-t border-slate-100 px-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{job?.title ?? "Job total"}</p>
                      {showLineDescriptions && (
                        <p className="text-xs text-slate-500">Itemized services can be added before sending.</p>
                      )}
                    </div>
                    <span className="text-right tabular-nums">1</span>
                    <span className="text-right font-medium tabular-nums">{formatMoney(invoice.total)}</span>
                  </div>
                ) : (
                  invoice.lineItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_72px_96px] border-t border-slate-100 px-3 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{item.description}</p>
                        {showLineDescriptions && (
                          <p className="text-xs text-slate-500">{formatMoney(item.unitPrice)} each</p>
                        )}
                      </div>
                      <span className="text-right tabular-nums">{item.quantity}</span>
                      <span className="text-right font-medium tabular-nums">{formatMoney(item.quantity * item.unitPrice)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="tabular-nums">{formatMoney(invoice.total)}</span>
                </div>
                {showPayments && totalPaid > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Payments</span>
                    <span className="tabular-nums">-{formatMoney(totalPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold">
                  <span>Balance due</span>
                  <span className="tabular-nums">{formatMoney(remaining)}</span>
                </div>
              </div>

              {paymentSummary.length > 0 && (
                <div className="mt-5 rounded-lg bg-slate-900 p-4 text-white">
                  <p className="text-xs text-slate-300">Payment options</p>
                  <p className="mt-1 text-sm">{paymentSummary.join(", ")}</p>
                  <button className="mt-3 h-10 w-full rounded-md bg-white text-sm font-semibold text-slate-900">
                    Pay {formatMoney(remaining)}
                  </button>
                </div>
              )}

              {(attachPhotos || attachChecklist) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {attachPhotos && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Job photos attached</span>}
                  {attachChecklist && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Checklist attached</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </aside>
  );
}
