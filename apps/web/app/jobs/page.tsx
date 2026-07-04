"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { JobDTO, CustomerDTO, PropertyDTO } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { JobStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";

type SortField = "title" | "status" | "total" | "customer";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "lead" | "scheduled" | "in_progress" | "completed" | "canceled";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "lead", label: "Lead" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

export default function JobsPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [skip, setSkip] = useState(0);
  const take = 50;

  // Reset pagination when filters change
  useEffect(() => { setSkip(0); }, [search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [jb, cu] = await Promise.all([
          api.jobs(),
          api.customers(),
        ]);
        if (!cancelled) {
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

  // ── Create-job dialog ──
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [createPropertyId, setCreatePropertyId] = useState("");
  const [createProperties, setCreateProperties] = useState<PropertyDTO[]>([]);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1") setShowCreate(true);
  }, [searchParams]);

  // Load the chosen customer's properties for the optional Property select
  useEffect(() => {
    setCreatePropertyId("");
    if (!createCustomerId) {
      setCreateProperties([]);
      return;
    }
    let cancelled = false;
    api.customerProperties(createCustomerId)
      .then((props) => { if (!cancelled) setCreateProperties(props); })
      .catch(() => { if (!cancelled) setCreateProperties([]); });
    return () => { cancelled = true; };
  }, [createCustomerId]);

  const resetCreateForm = () => {
    setCreateTitle("");
    setCreateCustomerId("");
    setCreatePropertyId("");
    setCreateErr(null);
  };

  const handleCreateJob = async () => {
    if (!createTitle.trim() || !createCustomerId) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const created = await api.createJob({
        customerId: createCustomerId,
        title: createTitle.trim(),
        propertyId: createPropertyId || undefined,
      });
      setJobs((prev) => [created, ...prev]);
      setShowCreate(false);
      resetCreateForm();
    } catch {
      setCreateErr("Failed to create job");
    } finally {
      setCreating(false);
    }
  };

  // ── Customer map for O(1) lookups ──
  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) m.set(c.id, c.name);
    return m;
  }, [customers]);

  // ── Filter + sort ──
  const filteredSorted = useMemo(() => {
    let list = [...jobs];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((j) => j.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) => {
        const cust = customerMap.get(j.customerId);
        return (
          j.title.toLowerCase().includes(q) ||
          (cust?.toLowerCase().includes(q) ?? false) ||
          j.status.replace("_", " ").includes(q)
        );
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "total":
          cmp = a.total - b.total;
          break;
        case "customer": {
          const na = customerMap.get(a.customerId) ?? "";
          const nb = customerMap.get(b.customerId) ?? "";
          cmp = na.localeCompare(nb);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [jobs, search, sortField, sortDir, customerMap, statusFilter]);

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

  // ── No results state ──
  const paginated = useMemo(() => filteredSorted.slice(skip, skip + take), [filteredSorted, skip, take]);

  const noResults =
    (jobs.length > 0 && search.trim() && filteredSorted.length === 0) ||
    (statusFilter !== "all" && filteredSorted.length === 0);

  // ── Loading ──
  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-24 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-80 rounded-lg mb-4" />
        <div className="hidden md:block rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-none border-b border-border last:border-b-0" />
          ))}
        </div>
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
        title="Jobs"
        description={
          jobs.length > 0
            ? `${filteredSorted.length} of ${jobs.length} total`
            : undefined
        }
        actions={
          <Button variant="default" size="sm" onClick={() => setShowCreate(true)}>
            <span className="text-base mr-1">⊕</span> New Job
          </Button>
        }
      />

      {/* ── Error ── */}
      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {/* ── Search + filter ── */}
      {jobs.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <Input
            type="search"
            placeholder="Search by title, customer name, or status..."
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

      {/* ── Empty state ── */}
      {jobs.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No jobs yet"
            description="Create your first job to get started"
          />
          <div className="flex justify-center pb-6">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <span className="text-base mr-1">⊕</span> New Job
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* ═══ Desktop table ═══ */}
          <Card className="p-0 overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead field="title" label="Title" />
                  <SortHead field="status" label="Status" />
                  <SortHead field="customer" label="Customer" />
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
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noResults ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-sm text-fg-muted">
                        No jobs match your filters
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
                  paginated.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium text-fg">
                        {j.title}
                      </TableCell>
                      <TableCell>
                        <JobStatusBadge status={j.status} />
                      </TableCell>
                      <TableCell className="text-fg-muted">
                        {customerMap.get(j.customerId) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-fg">
                        {formatMoney(j.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="text-xs text-fg-link hover:text-fg transition-colors"
                        >
                          View →
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* ═══ Mobile cards ═══ */}
          <div className="md:hidden flex flex-col gap-3">
            {noResults ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-sm text-fg-muted">
                    No jobs match your filters
                  </p>
                  <button                      onClick={() => { setSearch(""); setStatusFilter("all"); }}
                    className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none"
                  >
                    Clear search
                  </button>
                </div>
              </Card>
            ) : (
              paginated.map((j) => {
                const cust = customerMap.get(j.customerId);
                return (
                  <Link
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="block no-underline hover:no-underline"
                  >
                    <Card className="p-4 hover:bg-surface-400 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-semibold text-fg truncate">
                            {j.title}
                          </p>
                          {cust && (
                            <p className="text-xs text-fg-muted mt-0.5">
                              {cust}
                            </p>
                          )}
                        </div>
                        <span className="text-base font-bold text-fg tabular-nums shrink-0">
                          {formatMoney(j.total)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <JobStatusBadge status={j.status} />
                        <span className="text-fg-dim text-sm">→</span>
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
          </div>
        </>)}

        <Pagination skip={skip} take={take} total={filteredSorted.length} onSkipChange={setSkip} />

      {/* ── Create job dialog ── */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) resetCreateForm();
          setShowCreate(open);
        }}
      >
        <DialogHeader>
          <DialogTitle>New Job</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateJob();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Title *</label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Furnace tune-up"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Customer *</label>
              <select
                value={createCustomerId}
                onChange={(e) => setCreateCustomerId(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="h-10 rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Property (optional)</label>
              <select
                value={createPropertyId}
                onChange={(e) => setCreatePropertyId(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="h-10 rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
                disabled={!createCustomerId || createProperties.length === 0}
              >
                <option value="">
                  {!createCustomerId
                    ? "Select a customer first"
                    : createProperties.length === 0
                      ? "No properties for this customer"
                      : "No property"}
                </option>
                {createProperties.map((p) => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            </div>
            {createErr && <p className="text-xs text-red">{createErr}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" disabled={creating} onClick={() => { setShowCreate(false); resetCreateForm(); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!createTitle.trim() || !createCustomerId || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
