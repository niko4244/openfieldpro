"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api, type BusinessSettingsDTO } from "@/lib/api";
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

export default function InvoicesPage() {
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
  const [createDiscountId, setCreateDiscountId] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [discounts, setDiscounts] = useState<BusinessSettingsDTO["taxes"]["discounts"]>([]);
  const [discountsEnabled, setDiscountsEnabled] = useState(true);

  // Jobs that don't already have an invoice
  const invoicedJobIds = useMemo(() => new Set(invoices.map((i) => i.jobId)), [invoices]);
  const uninvoicedJobs = useMemo(
    () => jobs.filter((j) => !invoicedJobIds.has(j.id) && j.status !== "canceled"),
    [jobs, invoicedJobIds],
  );

  const handleCreateInvoice = async () => {
    if (!createJobId) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const inv = await api.createInvoice({
        jobId: createJobId,
        ...(createDueAt ? { dueAt: new Date(createDueAt).toISOString() } : {}),
        ...(createDiscountId ? { discountId: createDiscountId } : {}),
      });
      setInvoices((prev) => [inv, ...prev]);
      setShowCreate(false);
      setCreateJobId("");
      setCreateDueAt("");
      setCreateDiscountId("");
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openCreate = () => {
    setCreateJobId("");
    setCreateDueAt("");
    setCreateDiscountId("");
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
        const orgSettings = await api.org().catch(() => null);
        if (!cancelled) {
          setInvoices(iv);
          setJobs(jb);
          setCustomers(cu);
          setDiscounts(orgSettings?.businessSettings?.taxes?.discounts ?? []);
          setDiscountsEnabled(orgSettings?.businessSettings?.taxes?.discountsEnabled ?? true);
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
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setShowCreate(false); }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateInvoice(); }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Create Invoice</h3>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>

                {createError && (
                  <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                      Job *
                    </label>
                    <select
                      value={createJobId}
                      onChange={(e) => setCreateJobId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                    >
                      <option value="">Select a job...</option>
                      {uninvoicedJobs.map((j) => {
                        const cust = customerMap.get(j.customerId);
                        return (
                          <option key={j.id} value={j.id}>
                            {j.title}{cust ? ` — ${cust}` : ""} · {formatMoney(j.total)}
                          </option>
                        );
                      })}
                    </select>
                    {uninvoicedJobs.length === 0 && (
                      <p className="text-xs text-fg-dim mt-1">All jobs already have invoices.</p>
                    )}
                  </div>

                  {discountsEnabled && discounts.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                        Discount
                      </label>
                      <select
                        value={createDiscountId}
                        onChange={(e) => setCreateDiscountId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                      >
                        <option value="">No discount</option>
                        {discounts.map((discount) => (
                          <option key={discount.id} value={discount.id}>
                            {discount.name} · {discount.type === "fixed" ? formatMoney(discount.value) : `${discount.value / 100}%`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                      Due date (optional)
                    </label>
                    <Input
                      type="date"
                      value={createDueAt}
                      onChange={(e) => setCreateDueAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button
                    type="submit"
                    disabled={!createJobId || createSubmitting}
                  >
                    {createSubmitting ? "Creating..." : "Create Invoice"}
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
