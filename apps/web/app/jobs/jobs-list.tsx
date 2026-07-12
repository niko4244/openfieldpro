"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CustomerDTO, JobDTO } from "@ofp/shared";
import { formatMoney } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { JobStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Pagination } from "@/components/pagination";

export interface JobListItem {
  id: string;
  customerId: string;
  title: string;
  description?: string | null;
  status: JobDTO["status"];
  scheduledAt?: string | null;
  createdAt: string;
  total?: number;
  financialsRestricted?: boolean;
}

interface JobsListProps {
  jobs: JobListItem[];
  customers: CustomerDTO[];
  role: string | null;
  error?: string | null;
}

type SortField = "title" | "status" | "customer" | "scheduled" | "total";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | JobDTO["status"];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "lead", label: "Lead" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

function scheduledLabel(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function JobsList({ jobs, customers, role, error }: JobsListProps) {
  const isTechnician = role === "technician";
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("scheduled");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [skip, setSkip] = useState(0);
  const take = 25;

  useEffect(() => {
    setSkip(0);
  }, [search, statusFilter]);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const filteredSorted = useMemo(() => {
    let list = [...jobs];
    if (statusFilter !== "all") {
      list = list.filter((job) => job.status === statusFilter);
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter((job) => {
        const customer = customerMap.get(job.customerId)?.toLowerCase() ?? "";
        return (
          job.title.toLowerCase().includes(query) ||
          customer.includes(query) ||
          job.status.replaceAll("_", " ").includes(query)
        );
      });
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "title") comparison = a.title.localeCompare(b.title);
      if (sortField === "status") comparison = a.status.localeCompare(b.status);
      if (sortField === "customer") {
        comparison = (customerMap.get(a.customerId) ?? "").localeCompare(
          customerMap.get(b.customerId) ?? "",
        );
      }
      if (sortField === "scheduled") {
        comparison = new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime();
      }
      if (sortField === "total") comparison = (a.total ?? 0) - (b.total ?? 0);
      return sortDir === "asc" ? comparison : -comparison;
    });

    return list;
  }, [customerMap, jobs, search, sortDir, sortField, statusFilter]);

  const paginated = useMemo(
    () => filteredSorted.slice(skip, skip + take),
    [filteredSorted, skip],
  );

  function handleSort(field: SortField) {
    if (field === "total" && isTechnician) return;
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortHead({ field, label, align = "left" }: {
    field: SortField;
    label: string;
    align?: "left" | "right";
  }) {
    const active = sortField === field;
    return (
      <TableHead
        className={`cursor-pointer select-none transition-colors hover:text-fg ${align === "right" ? "text-right" : ""}`}
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="w-3 text-center text-[10px] text-fg-dim">
            {active ? (sortDir === "asc" ? "↑" : "↓") : " "}
          </span>
        </span>
      </TableHead>
    );
  }

  const noResults = jobs.length > 0 && filteredSorted.length === 0;
  const columnCount = isTechnician ? 5 : 6;

  return (
    <div data-testid={isTechnician ? "technician-jobs-list" : "office-jobs-list"}>
      <PageHeader
        title={isTechnician ? "Assigned jobs" : "Jobs"}
        description={
          jobs.length
            ? isTechnician
              ? `${filteredSorted.length} of ${jobs.length} assigned work orders`
              : `${filteredSorted.length} of ${jobs.length} total`
            : isTechnician
              ? "Work orders assigned to you appear here."
              : undefined
        }
        actions={
          isTechnician ? undefined : (
            <Link href="/jobs/new">
              <Button size="sm">
                <span className="mr-1 text-base">⊕</span> New job
              </Button>
            </Link>
          )
        }
      />

      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-sm text-red">The jobs workspace could not be loaded: {error}</p>
        </Card>
      )}

      {jobs.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Input
            type="search"
            placeholder="Search by title, customer, or status..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-md"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            style={{ colorScheme: "dark" }}
            className="h-10 cursor-pointer rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}

      {jobs.length === 0 && !error ? (
        <Card>
          <EmptyState
            title={isTechnician ? "No assigned jobs" : "No jobs yet"}
            description={
              isTechnician
                ? "Your dispatcher or owner can assign work from the office schedule."
                : "Create the first work order from New job."
            }
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead field="title" label="Title" />
                  <SortHead field="status" label="Status" />
                  <SortHead field="customer" label="Customer" />
                  <SortHead field="scheduled" label="Scheduled" />
                  {!isTechnician && <SortHead field="total" label="Total" align="right" />}
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noResults ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="py-10 text-center">
                      <p className="text-sm text-fg-muted">No jobs match your filters.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setStatusFilter("all");
                        }}
                        className="mt-1 cursor-pointer border-none bg-transparent text-xs text-fg-link hover:text-fg"
                      >
                        Clear filters
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium text-fg">{job.title}</TableCell>
                      <TableCell><JobStatusBadge status={job.status} /></TableCell>
                      <TableCell className="text-fg-muted">
                        {customerMap.get(job.customerId) ?? "Customer unavailable"}
                      </TableCell>
                      <TableCell className="text-fg-muted">{scheduledLabel(job.scheduledAt)}</TableCell>
                      {!isTechnician && (
                        <TableCell className="text-right font-mono tabular-nums text-fg">
                          {formatMoney(job.total ?? 0)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-xs text-fg-link transition-colors hover:text-fg"
                        >
                          Open →
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="flex flex-col gap-3 md:hidden">
            {noResults ? (
              <Card>
                <div className="py-10 text-center">
                  <p className="text-sm text-fg-muted">No jobs match your filters.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                    className="mt-1 cursor-pointer border-none bg-transparent text-xs text-fg-link hover:text-fg"
                  >
                    Clear filters
                  </button>
                </div>
              </Card>
            ) : (
              paginated.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block no-underline">
                  <Card className="cursor-pointer p-4 transition-colors hover:bg-surface-400">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-fg">{job.title}</p>
                        <p className="mt-0.5 text-xs text-fg-muted">
                          {customerMap.get(job.customerId) ?? "Customer unavailable"}
                        </p>
                      </div>
                      {!isTechnician && (
                        <span className="shrink-0 text-base font-bold tabular-nums text-fg">
                          {formatMoney(job.total ?? 0)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <JobStatusBadge status={job.status} />
                        <span className="text-xs text-fg-dim">{scheduledLabel(job.scheduledAt)}</span>
                      </div>
                      <span className="text-sm text-fg-dim">→</span>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </>
      )}

      <Pagination
        skip={skip}
        take={take}
        total={filteredSorted.length}
        onSkipChange={setSkip}
      />
    </div>
  );
}
