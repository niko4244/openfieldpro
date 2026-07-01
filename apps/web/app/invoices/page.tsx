"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { JobDTO, CustomerDTO } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";

interface Invoice {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
  dueAt?: string | null;
  createdAt?: string;
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

type SortField = "number" | "status" | "total";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "draft" | "sent" | "paid" | "void";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function dateInputAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [skip, setSkip] = useState(0);
  const take = 50;

  // Reset pagination when filters change
  useEffect(() => { setSkip(0); }, [search, statusFilter]);

  // ── Create invoice modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [createJobId, setCreateJobId] = useState("");
  const [createDueAt, setCreateDueAt] = useState("");
  const [createDueTerm, setCreateDueTerm] = useState<"receipt" | "7" | "14" | "30" | "custom">("14");
  const [createLineItems, setCreateLineItems] = useState<LineItem[]>([]);
  const [createLinesLoading, setCreateLinesLoading] = useState(false);
  const [createSendEmail, setCreateSendEmail] = useState(true);
  const [createSendText, setCreateSendText] = useState(false);
  const [createAllowCard, setCreateAllowCard] = useState(true);
  const [createAllowCashCheck, setCreateAllowCashCheck] = useState(true);
  const [createMessage, setCreateMessage] = useState("Thanks for choosing us. You can review and pay this invoice online.");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // HCP-style progress invoicing allows another invoice from the same job.
  const invoiceCandidateJobs = useMemo(
    () => jobs.filter((j) => j.status !== "canceled"),
    [jobs],
  );

  const selectedCreateJob = useMemo(
    () => jobs.find((j) => j.id === createJobId) ?? null,
    [jobs, createJobId],
  );

  const selectedCreateCustomer = useMemo(
    () => (selectedCreateJob ? customers.find((c) => c.id === selectedCreateJob.customerId) ?? null : null),
    [customers, selectedCreateJob],
  );

  const createPreviewTotal = useMemo(
    () =>
      createLineItems.length > 0
        ? createLineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
        : selectedCreateJob?.total ?? 0,
    [createLineItems, selectedCreateJob],
  );

  useEffect(() => {
    if (!showCreate || !createJobId) {
      setCreateLineItems([]);
      return;
    }
    let cancelled = false;
    setCreateLinesLoading(true);
    api
      .lineItems(createJobId)
      .then((items) => {
        if (!cancelled) setCreateLineItems(items);
      })
      .catch(() => {
        if (!cancelled) setCreateLineItems([]);
      })
      .finally(() => {
        if (!cancelled) setCreateLinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreate, createJobId]);

  const applyDueTerm = (term: "receipt" | "7" | "14" | "30" | "custom") => {
    setCreateDueTerm(term);
    if (term === "receipt") setCreateDueAt(dateInputAfter(0));
    if (term === "7") setCreateDueAt(dateInputAfter(7));
    if (term === "14") setCreateDueAt(dateInputAfter(14));
    if (term === "30") setCreateDueAt(dateInputAfter(30));
  };

  const handleCreateInvoice = async () => {
    if (!createJobId) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const inv = await api.createInvoice({
        jobId: createJobId,
        ...(createDueAt ? { dueAt: new Date(createDueAt).toISOString() } : {}),
      });
      setInvoices((prev) => [inv, ...prev]);
      setShowCreate(false);
      setCreateJobId("");
      setCreateDueAt("");
      router.push(`/invoices/${inv.id}`);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openCreate = () => {
    setCreateJobId("");
    setCreateLineItems([]);
    setCreateSendEmail(true);
    setCreateSendText(false);
    setCreateAllowCard(true);
    setCreateAllowCashCheck(true);
    setCreateMessage("Thanks for choosing us. You can review and pay this invoice online.");
    applyDueTerm("14");
    setCreateError(null);
    setShowCreate(true);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [iv, jb, cu] = await Promise.all([
          api.invoices().catch(() => [] as Invoice[]),
          api.jobs().catch(() => [] as JobDTO[]),
          api.customers().catch(() => [] as CustomerDTO[]),
        ]);
        if (!cancelled) {
          setInvoices(iv);
          setJobs(jb);
          setCustomers(cu);
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

  // ── Lookups ──
  const jobMap = useMemo(() => {
    const m = new Map<string, JobDTO>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) m.set(c.id, c.name);
    return m;
  }, [customers]);

  // ── Metrics ──
  const outstanding = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "sent" || i.status === "draft")
        .reduce((a, i) => a + i.total, 0),
    [invoices],
  );

  // ── Filter + sort ──
  const filteredSorted = useMemo(() => {
    let list = [...invoices];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((i) => i.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((inv) => {
        const job = jobMap.get(inv.jobId);
        const custName = job ? customerMap.get(job.customerId) : undefined;
        return (
          inv.number.toLowerCase().includes(q) ||
          (custName?.toLowerCase().includes(q) ?? false) ||
          (job?.title.toLowerCase().includes(q) ?? false)
        );
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "number":
          cmp = a.number.localeCompare(b.number);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "total":
          cmp = a.total - b.total;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [invoices, search, sortField, sortDir, jobMap, customers, statusFilter]);

  const paginated = useMemo(() => filteredSorted.slice(skip, skip + take), [filteredSorted, skip, take]);

  // ── Sort helpers ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortHead = ({ field, label }: { field: SortField; label: string }) => {
    const active = sortField === field;
    return (
      <TableHead
        className="cursor-pointer select-none hover:text-fg transition-colors"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-fg-dim text-[10px] w-3 text-center">
            {active ? (sortDir === "asc" ? "↑" : "↓") : " "}
          </span>
        </span>
      </TableHead>
    );
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
        <Skeleton className="h-10 w-80 rounded-lg mb-4" />
        {/* Desktop skeleton */}
        <div className="hidden md:block rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-none border-b border-border last:border-b-0" />
          ))}
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={
          invoices.length > 0
            ? `${filteredSorted.length} of ${invoices.length} total · ${formatMoney(outstanding)} outstanding`
            : undefined
        }
        actions={
          <Button onClick={openCreate} size="sm">
            ⊕ Create Invoice
          </Button>
        }
      />

      {/* ── Error ── */}
      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {/* ── Create Invoice modal ── */}
      {showCreate && (
        <>
          <button
            type="button"
            aria-label="Close create invoice dialog"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <Card className="w-full max-w-5xl max-h-[92vh] overflow-y-auto p-0">
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateInvoice(); }}
                className="p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-lg font-semibold text-fg">Create invoice</h3>
                    <p className="text-sm text-fg-muted mt-1">
                      Choose a job, confirm the customer view, then continue in the invoice editor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="h-9 w-9 rounded-md text-fg-muted hover:bg-surface-200 hover:text-fg"
                    aria-label="Close create invoice dialog"
                  >
                    x
                  </button>
                </div>

                {createError && (
                  <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
                  <div className="space-y-4">
                    <div className="rounded-lg bg-surface-200 p-4">
                      <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                        Job
                      </label>
                      <select
                        value={createJobId}
                        onChange={(e) => setCreateJobId(e.target.value)}
                        style={{ colorScheme: "dark" }}
                        className="h-10 w-full rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                      >
                        <option value="">Select a job...</option>
                        {invoiceCandidateJobs.map((j) => {
                          const cust = customerMap.get(j.customerId);
                          return (
                            <option key={j.id} value={j.id}>
                              {j.title}{cust ? ` - ${cust}` : ""} | {formatMoney(j.total)}
                            </option>
                          );
                        })}
                      </select>
                      {invoiceCandidateJobs.length === 0 && (
                        <p className="text-xs text-fg-dim mt-2">No active jobs are available for invoicing.</p>
                      )}
                      {selectedCreateCustomer && (
                        <div className="mt-3 rounded-md bg-surface-300 p-3">
                          <p className="text-sm font-medium text-fg">{selectedCreateCustomer.name}</p>
                          <p className="text-xs text-fg-muted">
                            {[selectedCreateCustomer.email, selectedCreateCustomer.phone].filter(Boolean).join(" | ") || "No contact on file"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg bg-surface-200 p-4">
                        <p className="text-xs font-semibold text-fg-muted mb-2">Due terms</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ["receipt", "Upon receipt"],
                            ["7", "Net 7"],
                            ["14", "Net 14"],
                            ["30", "Net 30"],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => applyDueTerm(value as "receipt" | "7" | "14" | "30")}
                              className={`h-9 rounded-md text-sm font-medium ${createDueTerm === value ? "bg-accent text-white" : "bg-surface-300 text-fg-muted hover:text-fg"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <label className="mt-3 block">
                          <span className="text-xs text-fg-muted">Custom date</span>
                          <Input
                            className="mt-1"
                            type="date"
                            value={createDueAt}
                            onChange={(e) => {
                              setCreateDueTerm("custom");
                              setCreateDueAt(e.target.value);
                            }}
                          />
                        </label>
                      </div>

                      <div className="rounded-lg bg-surface-200 p-4">
                        <p className="text-xs font-semibold text-fg-muted mb-2">Send and payment options</p>
                        <div className="space-y-2">
                          <label className="flex min-h-10 items-center justify-between gap-3 text-sm text-fg">
                            Email invoice
                            <input type="checkbox" checked={createSendEmail} onChange={(e) => setCreateSendEmail(e.target.checked)} />
                          </label>
                          <label className="flex min-h-10 items-center justify-between gap-3 text-sm text-fg">
                            Text invoice
                            <input type="checkbox" checked={createSendText} onChange={(e) => setCreateSendText(e.target.checked)} />
                          </label>
                          <label className="flex min-h-10 items-center justify-between gap-3 text-sm text-fg">
                            Card payments
                            <input type="checkbox" checked={createAllowCard} onChange={(e) => setCreateAllowCard(e.target.checked)} />
                          </label>
                          <label className="flex min-h-10 items-center justify-between gap-3 text-sm text-fg">
                            Cash/check
                            <input type="checkbox" checked={createAllowCashCheck} onChange={(e) => setCreateAllowCashCheck(e.target.checked)} />
                          </label>
                        </div>
                      </div>
                    </div>

                    <label className="block rounded-lg bg-surface-200 p-4">
                      <span className="text-xs font-semibold text-fg-muted">Invoice message</span>
                      <textarea
                        value={createMessage}
                        onChange={(e) => setCreateMessage(e.target.value)}
                        className="mt-2 min-h-24 w-full rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      />
                    </label>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-fg-muted">Preview</p>
                        <p className="text-base font-semibold text-fg">{selectedCreateJob?.title ?? "Select a job"}</p>
                      </div>
                      <span className="text-lg font-semibold text-fg tabular-nums">{formatMoney(createPreviewTotal)}</span>
                    </div>
                    <div className="mt-4 rounded-lg bg-surface-300 p-3">
                      {createLinesLoading ? (
                        <p className="text-sm text-fg-muted">Loading line items...</p>
                      ) : createLineItems.length > 0 ? (
                        <div className="space-y-2">
                          {createLineItems.map((item) => (
                            <div key={item.id} className="flex justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <p className="truncate text-fg">{item.description}</p>
                                <p className="text-xs text-fg-muted">{item.quantity} x {formatMoney(item.unitPrice)}</p>
                              </div>
                              <span className="font-mono text-fg tabular-nums">{formatMoney(item.quantity * item.unitPrice)}</span>
                            </div>
                          ))}
                        </div>
                      ) : selectedCreateJob ? (
                        <p className="text-sm text-fg-muted">No line items yet. The invoice will use the job total for now.</p>
                      ) : (
                        <p className="text-sm text-fg-muted">Choose a job to preview invoice contents.</p>
                      )}
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-fg-muted">
                      <p>Delivery: {[createSendEmail ? "email" : null, createSendText ? "text" : null].filter(Boolean).join(" + ") || "not selected"}</p>
                      <p>Payment: {[createAllowCard ? "card" : null, createAllowCashCheck ? "cash/check" : null].filter(Boolean).join(" + ") || "offline only"}</p>
                      <p>Due: {createDueAt || "No due date"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-6">
                  <Button
                    type="submit"
                    disabled={!createJobId || createSubmitting}
                  >
                    {createSubmitting ? "Creating..." : "Create and edit invoice"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {/* ── Search + filter ── */}
      {invoices.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <Input
            type="search"
            placeholder="Search by invoice number, customer, or job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{ colorScheme: "dark" }}
            className="h-10 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Content ── */}
      {invoices.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No invoices yet"
            description="Click 'Create Invoice' above to generate one from a job."
          />
        </Card>
      ) : (
        <>
          {/* ═══ Desktop table ═══ */}
          <Card className="p-0 overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead field="number" label="Number" />
                  <TableHead>Customer</TableHead>
                  <TableHead>Job</TableHead>
                  <SortHead field="status" label="Status" />
                  <TableHead className="text-right">
                    <span
                      className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
                      onClick={() => handleSort("total")}
                    >
                      Total
                      <span className="text-fg-dim text-[10px] w-3 text-center">
                        {sortField === "total" ? (sortDir === "asc" ? "↑" : "↓") : " "}
                      </span>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-sm text-fg-muted">
                        No invoices match your filters
                      </p>
                      <button
                        onClick={() => { setSearch(""); setStatusFilter("all"); }}
                        className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none"
                      >
                        Clear search
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((inv) => {
                    const job = jobMap.get(inv.jobId);
                    const cust = job ? customerMap.get(job.customerId) : undefined;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-fg font-mono text-xs">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="hover:text-fg-link transition-colors"
                          >
                            {inv.number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {cust ?? "—"}
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {job ? (
                            <Link
                              href={`/jobs/${job.id}`}
                              className="hover:text-fg transition-colors"
                            >
                              {job.title}
                            </Link>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-fg">
                          {formatMoney(inv.total)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          {/* ═══ Mobile cards ═══ */}
          <div className="md:hidden flex flex-col gap-3">
            {paginated.length === 0 ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-sm text-fg-muted">
                    No invoices match &ldquo;{search}&rdquo;
                  </p>
                  <button
                    onClick={() => setSearch("")}
                    className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none"
                  >
                    Clear search
                  </button>
                </div>
              </Card>
            ) : (
                  paginated.map((inv) => {
                    const job = jobMap.get(inv.jobId);
                    const cust = job ? customerMap.get(job.customerId) : undefined;
                    return (
                  <Card key={inv.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono text-xs text-fg font-medium hover:text-fg-link transition-colors no-underline"
                      >
                          {inv.number}
                      </Link>
                        <InvoiceStatusBadge status={inv.status} />
                      </div>
                      <span className="text-base font-bold text-fg tabular-nums">
                        {formatMoney(inv.total)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cust && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-dim w-16 shrink-0">Customer</span>
                          <Link
                            href={`/customers/${job?.customerId}`}
                            className="text-xs text-fg-link hover:text-fg transition-colors"
                          >
                            {cust}
                          </Link>
                        </div>
                      )}
                      {job && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-dim w-16 shrink-0">Job</span>
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-xs text-fg-link hover:text-fg transition-colors truncate"
                          >
                            {job.title}
                          </Link>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}

      <Pagination skip={skip} take={take} total={filteredSorted.length} onSkipChange={setSkip} />
    </div>
  );
}
