"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { JobDTO, CustomerDTO } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobStatusBadge } from "@/components/status-badge";

const COLUMNS = [
  { status: "lead", label: "Lead", color: "border-t-purple" },
  { status: "scheduled", label: "Scheduled", color: "border-t-blue" },
  { status: "in_progress", label: "In Progress", color: "border-t-yellow" },
  { status: "completed", label: "Completed", color: "border-t-green" },
  { status: "canceled", label: "Canceled", color: "border-t-red" },
] as const;

export default function PipelinePage() {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const dragRef = useRef<string | null>(null);
  const dragOverCol = useRef<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [jb, cust] = await Promise.all([
          api.jobs(),
          api.customers(),
        ]);
        if (!cancelled) {
          setJobs(jb);
          setCustomers(cust);
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

  const customerMap = useMemo(() => {
    const m = new Map<string, CustomerDTO>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter((j) => {
      const cust = customerMap.get(j.customerId);
      return (
        j.title.toLowerCase().includes(q) ||
        (cust?.name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [jobs, search, customerMap]);

  const grouped = useMemo(() => {
    const map = new Map<string, JobDTO[]>();
    for (const col of COLUMNS) map.set(col.status, []);
    for (const j of filtered) {
      const arr = map.get(j.status) ?? [];
      arr.push(j);
      map.set(j.status, arr);
    }
    return map;
  }, [filtered]);

  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-10 w-80 rounded-lg mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description={`${jobs.length} job${jobs.length !== 1 ? "s" : ""} across 5 stages`}
        actions={
          <Link href="/jobs?new=1">
            <Button size="sm">⊕ New Job</Button>
          </Link>
        }
      />

      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {jobs.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No jobs yet"
            description="Your pipeline will show here once you create jobs."
          />
        </Card>
      ) : (
        <>
          {/* Search */}
          <div className="mb-4">
            <Input
              type="search"
              placeholder="Search by job title or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Kanban columns - horizontal scroll on mobile */}
          <div className="overflow-x-auto pb-4 -mx-1 px-1">
            <div className="flex gap-3 min-w-[800px] lg:min-w-0 lg:grid lg:grid-cols-5">
              {COLUMNS.map((col) => {
                const colJobs = grouped.get(col.status) ?? [];
                const totalValue = colJobs.reduce((sum, j) => sum + j.total, 0);
                return (
                  <div key={col.status} className="flex-1 min-w-[160px] lg:min-w-0">
                    {/* Column header */}
                    <div className={`rounded-t-lg px-3 py-2 border-t-4 ${col.color} bg-surface-300`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-fg">{col.label}</span>
                        <span className="text-[11px] tabular-nums text-fg-muted bg-surface-200 px-1.5 py-0.5 rounded-full">
                          {colJobs.length}
                        </span>
                      </div>
                      {colJobs.length > 0 && (
                        <p className="text-[10px] text-fg-dim mt-0.5 tabular-nums">
                          {formatMoney(totalValue)}
                        </p>
                      )}
                    </div>

                    {/* Column body — drop zone */}
                    <div
                      className={`rounded-b-lg bg-surface-200 p-2 flex flex-col gap-2 min-h-[200px] transition-colors ${dragOverCol.current === col.status ? "bg-accent/10 ring-1 ring-accent/30" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        dragOverCol.current = col.status;
                      }}
                      onDragLeave={() => {
                        dragOverCol.current = null;
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const jobId = dragRef.current;
                        dragRef.current = null;
                        dragOverCol.current = null;
                        if (!jobId) return;
                        const currentStatus = jobs.find((j) => j.id === jobId)?.status;
                        if (currentStatus === col.status) return; // dropped on own column
                        setMoving(jobId);
                        try {
                          await api.patchJob(jobId, { status: col.status });
                          setJobs((prev) =>
                            prev.map((j) => (j.id === jobId ? { ...j, status: col.status } : j))
                          );
                        } catch {
                          // ponytail: on failure jobs are stale but refetch on next mount
                        } finally {
                          setMoving(null);
                        }
                      }}
                    >
                      {colJobs.length === 0 ? (
                        <p className="text-xs text-fg-dim text-center py-8">—</p>
                      ) : (
                        colJobs.map((j) => {
                          const cust = customerMap.get(j.customerId);
                          const isMoving = moving === j.id;
                          return (
                            <Link
                              key={j.id}
                              href={`/jobs/${j.id}`}
                              draggable={!isMoving}
                              onDragStart={() => { dragRef.current = j.id; }}
                              onDragEnd={() => { dragRef.current = null; }}
                              className={`block p-3 rounded-lg bg-surface-300 hover:bg-surface-400 transition-all no-underline border-l-2 border-accent ${isMoving ? "opacity-50" : ""}`}
                              onClick={(e) => {
                                if (dragRef.current) { e.preventDefault(); dragRef.current = null; }
                              }}
                            >
                              <p className="text-xs font-medium text-fg line-clamp-2 leading-snug">
                                {j.title}
                              </p>
                              {cust && (
                                <p className="text-[10px] text-fg-muted mt-1 truncate">
                                  {cust.name}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[11px] font-mono tabular-nums text-fg-dim">
                                  {formatMoney(j.total)}
                                </span>
                                <JobStatusBadge status={j.status} />
                                {j.scheduledAt && (
                                  <span className="text-[9px] text-fg-dim">
                                    {new Date(j.scheduledAt).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                )}
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
