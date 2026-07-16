"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { JobDTO } from "@ofp/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

type ViewMode = "day" | "week" | "month";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export default function SchedulePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobDataWarning, setJobDataWarning] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [view, setView] = useState<ViewMode>(() => {
    const value = searchParams.get("view");
    return value === "week" || value === "month" ? value : "day";
  });
  const [focusDate, setFocusDate] = useState(() => dateFromKey(searchParams.get("date")));

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("date", dateKey(focusDate));
    if (search.trim()) params.set("q", search.trim());
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [focusDate, pathname, router, search, view]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setJobDataWarning(false);
      const [appointmentResult, jobResult] = await Promise.allSettled([
        api.appointments(),
        api.jobs(),
      ]);
      if (cancelled) return;
      if (appointmentResult.status === "rejected") {
        setAppointments([]);
        setJobs([]);
        setError("Schedule could not be loaded. Check the connection and try again.");
      } else {
        setAppointments(appointmentResult.value);
        if (jobResult.status === "fulfilled") {
          setJobs(jobResult.value);
        } else {
          setJobs([]);
          setJobDataWarning(true);
        }
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reloadVersion]);

  const jobMap = useMemo(() => {
    const m = new Map<string, JobDTO>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  // ── Filter by search ──
  const filtered = useMemo(() => {
    if (!search.trim()) return appointments;
    const q = search.toLowerCase();
    return appointments.filter((a) => {
      const title = jobMap.get(a.jobId)?.title;
      return (
        (title?.toLowerCase().includes(q) ?? false) ||
        (a.technicianId?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [appointments, search, jobMap]);

  const selectedKey = dateKey(focusDate);
  const dayAppointments = useMemo(
    () => filtered.filter((appointment) => dateKey(new Date(appointment.startsAt)) === selectedKey),
    [filtered, selectedKey],
  );

  // ── Appointments by date string for month view ──
  const apptsByDateString = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of filtered) {
      const d = new Date(a.startsAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [filtered]);

  // ── Week view: 7-day columns ──
  const weekColumns = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(focusDate);
    startOfWeek.setDate(focusDate.getDate() - focusDate.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const cols: { date: Date; label: string; isToday: boolean; appts: Appointment[] }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const isToday = d.toDateString() === now.toDateString();

      cols.push({
        date: d,
        label: DAY_NAMES[d.getDay()],
        isToday,
        appts: filtered.filter((a) => {
          const ad = new Date(a.startsAt);
          return ad.toDateString() === d.toDateString();
        }),
      });
    }

    return cols;
  }, [filtered, focusDate]);

  // ── Month view: 42-cell grid ──
  const monthCells = useMemo(() => {
    const cells: { date: Date; isCurrentMonth: boolean; isToday: boolean; appts: Appointment[] }[] = [];
    const firstOfMonth = new Date(focusDate);
    firstOfMonth.setDate(1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay()); // rewind to Sunday

    const now = new Date();
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      cells.push({
        date: d,
        isCurrentMonth: d.getMonth() === focusDate.getMonth(),
        isToday: d.toDateString() === now.toDateString(),
        appts: apptsByDateString.get(key) ?? [],
      });
    }
    return cells;
  }, [focusDate, apptsByDateString]);

  const moveDate = (direction: -1 | 1) => {
    setFocusDate((current) => {
      if (view === "month") return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      const next = new Date(current);
      next.setDate(current.getDate() + direction * (view === "week" ? 7 : 1));
      return next;
    });
  };
  const dateLabel = focusDate.toLocaleDateString(undefined, {
    ...(view === "month" ? { month: "long" as const, year: "numeric" as const } : { weekday: "long" as const, month: "long" as const, day: "numeric" as const }),
  });

  // ── Loading ──
  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <Skeleton className="h-10 w-80 rounded-lg mb-4" />
        <div className="hidden md:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl mb-3" />
          ))}
        </div>
        <div className="md:hidden flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        description={`${appointments.length} appointment${appointments.length !== 1 ? "s" : ""}${search.trim() ? ` · ${filtered.length} match` : ""}`}
        actions={
          <div className="flex gap-2">
            <Link href="/jobs/new"><Button variant="secondary" size="sm">New job</Button></Link>
            <Link href="/dispatch"><Button size="sm">Open dispatch</Button></Link>
          </div>
        }
      />

      {/* ── Error ── */}
      {error && (
        <Card className="mb-6 border-red/30 bg-red/5" role="alert">
          <p className="text-sm font-semibold text-red">{error}</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => setReloadVersion((value) => value + 1)}>
            Retry schedule
          </Button>
        </Card>
      )}

      {jobDataWarning && !error && (
        <Card className="mb-6 border-yellow/30 bg-yellow/5" role="status">
          <p className="text-sm font-semibold text-yellow">Job details are temporarily unavailable.</p>
          <p className="mt-1 text-xs text-fg-muted">Visit times are still shown. Retry to restore job titles.</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => setReloadVersion((value) => value + 1)}>
            Retry job details
          </Button>
        </Card>
      )}

      {/* ── Empty state ── */}
      {appointments.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No visits scheduled"
            description="Create a job with a visit time, or open dispatch to review unassigned work."
            actions={
              <>
                <Link href="/jobs/new"><Button variant="secondary" size="sm">New job</Button></Link>
                <Link href="/dispatch"><Button size="sm">Open dispatch</Button></Link>
              </>
            }
          />
        </Card>
      ) : (
        <>
          {/* ── View toggle + search ── */}
          <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex w-fit overflow-hidden rounded-lg border border-border" role="tablist" aria-label="Schedule view">
              <button
                type="button"
                role="tab"
                aria-selected={view === "day"}
                onClick={() => setView("day")}
                className={`px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none ${
                  view === "day"
                    ? "bg-accent text-white"
                    : "bg-surface-300 text-fg-muted hover:text-fg"
                }`}
              >
                Day
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "week"}
                onClick={() => setView("week")}
                className={`px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none ${
                  view === "week"
                    ? "bg-accent text-white"
                    : "bg-surface-300 text-fg-muted hover:text-fg"
                }`}
              >
                Week
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "month"}
                onClick={() => setView("month")}
                className={`px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none ${
                  view === "month"
                    ? "bg-accent text-white"
                    : "bg-surface-300 text-fg-muted hover:text-fg"
                }`}
              >
                Month
              </button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => moveDate(-1)} aria-label={`Previous ${view}`}>← Previous</Button>
              <Button variant="secondary" size="sm" onClick={() => setFocusDate(new Date())}>Today</Button>
              <Button variant="secondary" size="sm" onClick={() => moveDate(1)} aria-label={`Next ${view}`}>Next →</Button>
              <p className="min-w-0 text-sm font-semibold text-fg" aria-live="polite">{dateLabel}</p>
            </div>
            <Input
              type="search"
              aria-label="Search schedule"
              name="schedule-search"
              autoComplete="off"
              placeholder="Search by job title or technician…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-w-0 lg:ml-auto lg:max-w-xs"
            />
          </div>

          {/* ═══ Day view ═══ */}
          {view === "day" && (
            <>
              {dayAppointments.length === 0 ? (
                <Card>
                  <div className="text-center py-10">
                    <p className="text-sm text-fg-muted">
                      {search.trim() ? "No visits match your search on this day" : "No visits scheduled on this day"}
                    </p>
                    {search.trim() && (
                      <button onClick={() => setSearch("")} className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none">
                        Clear search
                      </button>
                    )}
                  </div>
                </Card>
              ) : (
                <div className="max-w-2xl">
                  <div className="flex flex-col gap-2">
                    {dayAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appt={appointment} jobTitle={jobMap.get(appointment.jobId)?.title ?? appointment.jobId.slice(0, 8)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ Week view ═══ */}
          {view === "week" && (
            <>
              {/* Desktop: 7-column grid */}
              <div className="hidden md:grid grid-cols-7 gap-3 max-w-5xl">
                {weekColumns.map((col) => (
                  <div key={col.label} className="flex flex-col">
                    <div
                      className={`text-center py-2 rounded-t-lg text-xs font-semibold ${
                        col.isToday
                          ? "bg-accent text-white"
                          : "bg-surface-300 text-fg-muted"
                      }`}
                    >
                      <div>{col.label}</div>
                      <div className="text-[10px] opacity-75">{col.date.getDate()}</div>
                    </div>
                    <div className="flex flex-col gap-1.5 p-1.5 rounded-b-lg bg-surface-200 min-h-[120px]">
                      {col.appts.length === 0 ? (
                        <p className="text-[10px] text-fg-dim text-center py-3">—</p>
                      ) : (
                        col.appts.map((a) => (
                          <Link
                            key={a.id}
                            href={`/jobs/${a.jobId}`}
                            className="block p-2 rounded bg-surface-300 hover:bg-surface-400 transition-colors no-underline hover:no-underline border-l-2 border-accent"
                          >
                            <p className="text-[11px] text-fg font-medium leading-snug line-clamp-2">
                              {jobMap.get(a.jobId)?.title ?? a.jobId.slice(0, 8)}
                            </p>
                            <p className="text-[10px] text-fg-dim mt-1">
                              {formatTimeShort(a.startsAt)}–{formatTimeShort(a.endsAt)}
                            </p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile: scrollable day list */}
              <div className="md:hidden">
                {weekColumns.map((col) => (
                  <section key={col.label} className="mb-4">
                    <div
                      className={`flex items-center justify-between px-3 py-2 rounded-t-lg text-xs font-semibold ${
                        col.isToday ? "bg-accent text-white" : "bg-surface-300 text-fg-muted"
                      }`}
                    >
                      <span>
                        {col.label} {col.date.getDate()}
                      </span>
                      {col.isToday && (
                        <span className="text-[10px] opacity-90 font-medium">Today</span>
                      )}
                    </div>
                    <div className="rounded-b-lg bg-surface-200">
                      {col.appts.length === 0 ? (
                        <p className="text-xs text-fg-dim text-center py-4 px-3">No appointments</p>
                      ) : (
                        col.appts.map((a) => (
                          <AppointmentRow key={a.id} appt={a} jobTitle={jobMap.get(a.jobId)?.title ?? a.jobId.slice(0, 8)} compact />
                        ))
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}

          {/* ═══ Month view ═══ */}
          {view === "month" && (
            <>
              {filtered.length === 0 ? (
                <Card>
                  <div className="text-center py-10">
                    <p className="text-sm text-fg-muted">No appointments match your search</p>
                    <button
                      onClick={() => setSearch("")}
                      className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none"
                    >
                      Clear search
                    </button>
                  </div>
                </Card>
              ) : (
                <>

              {/* Desktop: full calendar grid */}
              <div className="hidden md:block max-w-5xl">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                  {DAY_NAMES.map((name) => (
                    <div key={name} className="text-center py-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                      {name}
                    </div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-0.5">
                  {monthCells.map((cell, idx) => {
                    const jobTitles = cell.appts.map((a) => jobMap.get(a.jobId)?.title ?? a.jobId.slice(0, 8));
                    return (
                      <div
                        key={idx}
                        className={`min-h-[80px] p-1.5 rounded-md border transition-colors ${
                          cell.isCurrentMonth
                            ? cell.isToday
                              ? "border-accent bg-accent/5 ring-1 ring-accent"
                              : "border-border bg-surface-200"
                            : "border-border/40 bg-surface-100 opacity-50"
                        }`}
                      >
                        <p
                          className={`text-[11px] font-semibold mb-0.5 ${
                            cell.isToday ? "text-accent" : cell.isCurrentMonth ? "text-fg" : "text-fg-muted"
                          }`}
                        >
                          {cell.date.getDate()}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {jobTitles.slice(0, 3).map((title, i) => (
                            <Link
                              key={i}
                              href={`/jobs/${cell.appts[i].jobId}`}
                              className="block text-[10px] leading-tight truncate rounded px-1 py-px bg-accent/10 text-fg hover:bg-accent/20 transition-colors no-underline hover:no-underline"
                            >
                              {title}
                            </Link>
                          ))}
                          {jobTitles.length > 3 && (
                            <p className="text-[10px] text-fg-muted pl-1">
                              +{jobTitles.length - 3} more
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile: compact dot calendar */}
              <div className="md:hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                  {DAY_NAMES.map((name) => (
                    <div key={name} className="text-center py-1 text-[10px] font-semibold text-fg-muted">
                      {name.slice(0, 2)}
                    </div>
                  ))}
                </div>
                {/* Dot grid */}
                <div className="grid grid-cols-7 gap-0.5">
                  {monthCells.map((cell, idx) => (
                    <div
                      key={idx}
                      className={`aspect-square flex flex-col items-center justify-center rounded-md text-xs border transition-colors ${
                        cell.isCurrentMonth
                          ? cell.isToday
                            ? "border-accent bg-accent/5 ring-1 ring-accent"
                            : "border-border bg-surface-200"
                          : "border-border/40 bg-surface-100 opacity-40"
                      }`}
                    >
                      <span
                        className={`text-[11px] font-semibold ${
                          cell.isToday ? "text-accent" : cell.isCurrentMonth ? "text-fg" : "text-fg-muted"
                        }`}
                      >
                        {cell.date.getDate()}
                      </span>
                      {cell.appts.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {cell.appts.slice(0, 3).map((_, i) => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-accent" />
                          ))}
                          {cell.appts.length > 3 && (
                            <span className="text-[9px] text-fg-muted">+{cell.appts.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Mobile appointment list for selected day */}
                {(() => {
                  const todayCell = monthCells.find((c) => c.isToday);
                  if (!todayCell || todayCell.appts.length === 0) return null;
                  return (
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold text-fg-muted mb-2">Today&rsquo;s Appointments</h4>
                      <div className="flex flex-col gap-2">
                        {todayCell.appts.map((a) => (
                          <AppointmentRow key={a.id} appt={a} jobTitle={jobMap.get(a.jobId)?.title ?? a.jobId.slice(0, 8)} compact />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              </>
            )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared appointment row component ──
function AppointmentRow({
  appt,
  jobTitle: title,
  compact,
}: {
  appt: Appointment;
  jobTitle: string;
  compact?: boolean;
}) {
  const start = new Date(appt.startsAt);
  const end = new Date(appt.endsAt);
  const timeStr = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Link
      href={`/jobs/${appt.jobId}`}
      className={`flex items-center gap-4 p-3 rounded-lg bg-surface-200 hover:bg-surface-400 transition-colors no-underline hover:no-underline ${
        compact ? "p-2.5 rounded-none border-b border-border last:border-b-0" : ""
      }`}
    >
      <div className="flex flex-col items-center min-w-14">
        <span className={`text-fg-muted ${compact ? "text-[10px]" : "text-xs"}`}>
          {timeStr}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-fg truncate ${compact ? "text-xs" : "text-sm"}`}>
          {title}
        </p>
        {appt.technicianId && (
          <p className="text-xs text-fg-dim mt-0.5">
            Tech: {appt.technicianId.slice(0, 8)}
          </p>
        )}
      </div>
      <span className="text-fg-dim text-sm shrink-0">→</span>
    </Link>
  );
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
