"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { assignDispatchJob, updateDispatchStatus } from "../lib/client-api";
import type { DispatchTechnicianDTO } from "../lib/api";

function isoFromLocal(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

function Status({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>;
}

export function DispatchAssignForm({ jobId, technicians }: { jobId: string; technicians: DispatchTechnicianDTO[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        await assignDispatchJob(jobId, {
          technicianId: String(form.get("technicianId") ?? "") || null,
          startsAt: isoFromLocal(form.get("startsAt")),
          endsAt: isoFromLocal(form.get("endsAt")),
        });
        setMessage("Dispatch updated.");
        router.refresh();
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    });
  }

  return (
    <form className="workflow-form compact-form" onSubmit={submit}>
      <label>
        <span>Technician</span>
        <select name="technicianId">
          <option value="">Unassigned</option>
          {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
        </select>
      </label>
      <label><span>Start</span><input name="startsAt" type="datetime-local" /></label>
      <label><span>End</span><input name="endsAt" type="datetime-local" /></label>
      <button className="button compact" disabled={pending}>{pending ? "Saving…" : "Dispatch"}</button>
      <Status message={message} />
    </form>
  );
}

export function DispatchStatusButtons({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function move(next: "scheduled" | "in_progress" | "completed") {
    setPending(next);
    setMessage(null);
    try {
      await updateDispatchStatus(jobId, next);
      setMessage(`Moved to ${next.replaceAll("_", " ")}.`);
      router.refresh();
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="action-panel">
      {status !== "scheduled" && <button className="button compact" disabled={!!pending} onClick={() => move("scheduled")}>{pending === "scheduled" ? "Moving…" : "Schedule"}</button>}
      {status !== "in_progress" && <button className="button compact" disabled={!!pending} onClick={() => move("in_progress")}>{pending === "in_progress" ? "Moving…" : "Start"}</button>}
      {status !== "completed" && <button className="button compact" disabled={!!pending} onClick={() => move("completed")}>{pending === "completed" ? "Moving…" : "Complete"}</button>}
      <Status message={message} />
    </div>
  );
}
