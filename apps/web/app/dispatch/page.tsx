"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import type { JobDTO, UserDTO } from "@ofp/shared";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { dispatchApi, type DispatchAppointment } from "@/lib/dispatch-api";
import {
  buildConflictMap,
  conflictsForAppointment,
  countConflictPairs,
} from "@/lib/dispatch-conflicts";

interface DispatchColumn {
  id: string;
  technicianId: string | null;
  title: string;
  subtitle: string;
  appointments: DispatchAppointment[];
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function appointmentDateKey(iso: string) {
  return dateKey(new Date(iso));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function statusLabel(status: JobDTO["status"]) {
  return status.replaceAll("_", " ");
}

function statusClasses(status: JobDTO["status"]) {
  if (status === "in_progress") return "border-blue/30 bg-blue/10 text-blue";
  if (status === "completed") return "border-green/30 bg-green/10 text-green";
  if (status === "canceled") return "border-red/30 bg-red/10 text-red";
  if (status === "lead") return "border-yellow/30 bg-yellow/10 text-yellow";
  return "border-border bg-surface-300 text-fg-muted";
}

function DispatchCard({
  appointment,
  job,
  technicians,
  saving,
  conflictTitles,
  onAssign,
  onDragStart,
}: {
  appointment: DispatchAppointment;
  job?: JobDTO;
  technicians: UserDTO[];
  saving: boolean;
  conflictTitles: string[];
  onAssign: (appointment: DispatchAppointment, technicianId: string | null) => void;
  onDragStart: (event: DragEvent<HTMLElement>, appointmentId: string) => void;
}) {
  const title = job?.title ?? `Job ${appointment.jobId.slice(0, 8)}`;
  const status = job?.status ?? "scheduled";
  const hasConflict = conflictTitles.length > 0;

  return (
    <article
      draggable={!saving}
      onDragStart={(event) => onDragStart(event, appointment.id)}
      className={`rounded-xl border p-3 shadow-sm transition-all ${
        hasConflict ? "border-red/50 bg-red/5" : "border-border bg-surface-200"
      } ${
        saving ? "opacity-60" : "cursor-grab hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md active:cursor-grabbing"
      }`}
      data-testid={`dispatch-card-${appointment.id}`}
      data-conflict={hasConflict ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold ${hasConflict ? "text-red" : "text-accent"}`}>
            {formatTime(appointment.startsAt)}–{formatTime(appointment.endsAt)}
          </p>
          <Link
            href={`/jobs/${appointment.jobId}`}
            className="mt-1 block truncate text-sm font-semibold text-fg no-underline hover:text-accent hover:no-underline"
          >
            {title}
          </Link>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusClasses(status)}`}>
          {statusLabel(status)}
        </span>
      </div>

      {hasConflict ? (
        <div className="mt-3 rounded-lg border border-red/30 bg-red/10 px-2.5 py-2" role="alert">
          <p className="text-[10px] font-black uppercase tracking-wide text-red">Time conflict</p>
          <p className="mt-1 text-[11px] text-fg-muted">
            Overlaps {conflictTitles.join(", ")}
          </p>
        </div>
      ) : null}

      <div className="mt-3 border-t border-border pt-3">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-fg-dim" htmlFor={`assign-${appointment.id}`}>
          Assigned technician
        </label>
        <select
          id={`assign-${appointment.id}`}
          aria-label={`Assign ${title}`}
          value={appointment.technicianId ?? ""}
          disabled={saving}
          onChange={(event) => onAssign(appointment, event.target.value || null)}
          className="mt-1.5 w-full rounded-lg border border-border bg-surface-100 px-2.5 py-2 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function DispatchLane({
  column,
  jobsById,
  technicians,
  savingIds,
  conflictMap,
  dragOver,
  onAssign,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  column: DispatchColumn;
  jobsById: Map<string, JobDTO>;
  technicians: UserDTO[];
  savingIds: Set<string>;
  conflictMap: Map<string, Set<string>>;
  dragOver: boolean;
  onAssign: (appointment: DispatchAppointment, technicianId: string | null) => void;
  onDragStart: (event: DragEvent<HTMLElement>, appointmentId: string) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const conflictCount = column.appointments.filter((appointment) => conflictMap.has(appointment.id)).length;

  return (
    <section
      className={`min-w-0 rounded-2xl border bg-surface-100 transition-colors ${
        dragOver
          ? "border-accent bg-accent/5 ring-2 ring-accent/20"
          : conflictCount > 0
            ? "border-red/35"
            : "border-border"
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid={`dispatch-lane-${column.id}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-fg">{column.title}</h2>
          <p className="mt-0.5 text-[11px] text-fg-dim">{column.subtitle}</p>
          {conflictCount > 0 ? (
            <p className="mt-1 text-[11px] font-semibold text-red">
              {conflictCount} conflicting {conflictCount === 1 ? "visit" : "visits"}
            </p>
          ) : null}
        </div>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-300 px-2 text-xs font-bold text-fg-muted">
          {column.appointments.length}
        </span>
      </header>

      <div className="space-y-3 p-3">
        {column.appointments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center">
            <p className="text-xs font-medium text-fg-muted">No visits assigned</p>
            <p className="mt-1 text-[11px] text-fg-dim">Drop an appointment here</p>
          </div>
        ) : (
          column.appointments.map((appointment) => {
            const conflictingIds = [...(conflictMap.get(appointment.id) ?? [])];
            const conflictTitles = conflictingIds.map((appointmentId) => {
              const conflictingAppointment = column.appointments.find((item) => item.id === appointmentId);
              if (!conflictingAppointment) return `another visit`;
              return jobsById.get(conflictingAppointment.jobId)?.title ?? `job ${conflictingAppointment.jobId.slice(0, 8)}`;
            });

            return (
              <DispatchCard
                key={appointment.id}
                appointment={appointment}
                job={jobsById.get(appointment.jobId)}
                technicians={technicians}
                saving={savingIds.has(appointment.id)}
                conflictTitles={conflictTitles}
                onAssign={onAssign}
                onDragStart={onDragStart}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

export default function DispatchPage() {
  const [appointments, setAppointments] = useState<DispatchAppointment[]>([]);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [dragLaneId, setDragLaneId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appointmentRows, jobRows, userRows] = await Promise.all([
        dispatchApi.appointments(),
        dispatchApi.jobs(),
        dispatchApi.users(),
      ]);
      setAppointments(appointmentRows);
      setJobs(jobRows);
      setUsers(userRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const technicians = useMemo(
    () => users.filter((user) => user.active && user.role === "technician").toSorted((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const selectedKey = dateKey(selectedDate);

  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointmentDateKey(appointment.startsAt) === selectedKey)
        .toSorted((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments, selectedKey],
  );

  const visibleAppointments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dayAppointments.filter((appointment) => {
      if (!query) return true;
      const job = jobsById.get(appointment.jobId);
      const technician = technicians.find((item) => item.id === appointment.technicianId);
      return (
        job?.title.toLowerCase().includes(query) ||
        job?.status.toLowerCase().includes(query) ||
        technician?.name.toLowerCase().includes(query)
      );
    });
  }, [dayAppointments, jobsById, search, technicians]);

  const conflictMap = useMemo(() => buildConflictMap(dayAppointments), [dayAppointments]);
  const conflictPairCount = useMemo(() => countConflictPairs(conflictMap), [conflictMap]);

  const columns = useMemo<DispatchColumn[]>(() => {
    const unassigned = visibleAppointments.filter((appointment) => !appointment.technicianId);
    const technicianColumns = technicians.map((technician) => ({
      id: technician.id,
      technicianId: technician.id,
      title: technician.name,
      subtitle: technician.email,
      appointments: visibleAppointments.filter((appointment) => appointment.technicianId === technician.id),
    }));

    return [
      {
        id: "unassigned",
        technicianId: null,
        title: "Unassigned",
        subtitle: "Needs dispatcher attention",
        appointments: unassigned,
      },
      ...technicianColumns,
    ];
  }, [technicians, visibleAppointments]);

  const busiestCount = useMemo(
    () => columns.reduce((max, column) => Math.max(max, column.appointments.length), 0),
    [columns],
  );

  const assignAppointment = useCallback(async (appointment: DispatchAppointment, technicianId: string | null) => {
    if (appointment.technicianId === technicianId) return;

    const technician = technicians.find((item) => item.id === technicianId);
    const conflicts = conflictsForAppointment(appointment, technicianId, appointments);
    if (conflicts.length > 0) {
      const conflictLabels = conflicts.map((item) => {
        const job = jobsById.get(item.jobId);
        return `${job?.title ?? "another visit"} (${formatTime(item.startsAt)}–${formatTime(item.endsAt)})`;
      });
      const message = `Cannot assign ${jobsById.get(appointment.jobId)?.title ?? "this visit"} to ${technician?.name ?? "that technician"} because it overlaps ${conflictLabels.join(", ")}.`;
      setError(message);
      setAnnouncement(message);
      return;
    }

    const previous = appointment.technicianId;
    const title = jobsById.get(appointment.jobId)?.title ?? "Visit";
    setError(null);
    setAnnouncement(`Assigning ${title}.`);
    setSavingIds((current) => new Set(current).add(appointment.id));
    setAppointments((current) =>
      current.map((item) => (item.id === appointment.id ? { ...item, technicianId } : item)),
    );

    try {
      const saved = await dispatchApi.assignAppointment(appointment.id, technicianId);
      setAppointments((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setAnnouncement(`${title} assigned to ${technician?.name ?? "Unassigned"}.`);
    } catch (caught) {
      setAppointments((current) =>
        current.map((item) => (item.id === appointment.id ? { ...item, technicianId: previous } : item)),
      );
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setAnnouncement(`${title} was not reassigned. ${message}`);
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(appointment.id);
        return next;
      });
    }
  }, [appointments, jobsById, technicians]);

  const handleDragStart = useCallback((event: DragEvent<HTMLElement>, appointmentId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", appointmentId);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLElement>, technicianId: string | null) => {
    event.preventDefault();
    setDragLaneId(null);
    const appointmentId = event.dataTransfer.getData("text/plain");
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (appointment) void assignAppointment(appointment, technicianId);
  }, [appointments, assignAppointment]);

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="mb-8 h-4 w-72" />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-96 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="dispatch-live-status">
        {announcement}
      </p>
      <PageHeader
        title="Dispatch board"
        description="Assign today’s visits, balance technician workload, and prevent double-booking."
        actions={
          <div className="flex gap-2">
            <Link href="/schedule" className="no-underline">
              <Button variant="secondary" size="sm">Calendar</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => void load()}>Refresh</Button>
          </div>
        }
      />

      {error ? (
        <Card className="mb-5 border-red/30 bg-red/5" role="alert">
          <p className="text-sm font-semibold text-red">Dispatch attention required</p>
          <p className="mt-1 text-xs text-fg-muted">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-3 text-xs font-semibold text-red underline underline-offset-2"
          >
            Dismiss
          </button>
        </Card>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">Visits</p>
          <p className="mt-2 text-2xl font-black text-fg">{dayAppointments.length}</p>
          <p className="mt-1 text-xs text-fg-muted">On the selected day</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">Unassigned</p>
          <p className={`mt-2 text-2xl font-black ${columns[0]?.appointments.length ? "text-yellow" : "text-green"}`}>
            {columns[0]?.appointments.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-fg-muted">Needs dispatcher action</p>
        </Card>
        <Card className={`p-4 ${conflictPairCount > 0 ? "border-red/35 bg-red/5" : ""}`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">Schedule conflicts</p>
          <p className={`mt-2 text-2xl font-black ${conflictPairCount > 0 ? "text-red" : "text-green"}`}>
            {conflictPairCount}
          </p>
          <p className="mt-1 text-xs text-fg-muted">Overlapping technician visits</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">Technicians</p>
          <p className="mt-2 text-2xl font-black text-fg">{technicians.length}</p>
          <p className="mt-1 text-xs text-fg-muted">Active field staff</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">Highest load</p>
          <p className="mt-2 text-2xl font-black text-fg">{busiestCount}</p>
          <p className="mt-1 text-xs text-fg-muted">Visits on one lane</p>
        </Card>
      </div>

      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate((current) => addDays(current, -1))}>← Previous</Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date())}>Today</Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate((current) => addDays(current, 1))}>Next →</Button>
            <div className="ml-1">
              <p className="text-sm font-bold text-fg">
                {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="text-[11px] text-fg-dim">Drag cards between lanes or use the assignment menu. Conflicting assignments are blocked.</p>
            </div>
          </div>
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search job, status, or technician…"
            className="w-full lg:max-w-sm"
          />
        </div>
      </Card>

      {visibleAppointments.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="text-base font-semibold text-fg">No visits on this day</p>
          <p className="mt-2 text-sm text-fg-muted">Choose another date or create an appointment from the calendar.</p>
          <Link href="/schedule" className="mt-4 inline-block text-sm font-semibold text-accent no-underline hover:underline">
            Open calendar
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="dispatch-board">
          {columns.map((column) => (
            <DispatchLane
              key={column.id}
              column={column}
              jobsById={jobsById}
              technicians={technicians}
              savingIds={savingIds}
              conflictMap={conflictMap}
              dragOver={dragLaneId === column.id}
              onAssign={assignAppointment}
              onDragStart={handleDragStart}
              onDragEnter={() => setDragLaneId(column.id)}
              onDragLeave={() => setDragLaneId((current) => (current === column.id ? null : current))}
              onDrop={(event) => handleDrop(event, column.technicianId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
