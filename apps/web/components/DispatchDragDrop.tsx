"use client";

import { type DragEvent, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDispatchStatus } from "../lib/client-api";

type DispatchDropStatus = "lead" | "scheduled" | "in_progress" | "completed";

export function DraggableDispatchCard({ jobId, children }: { jobId: string; children: ReactNode }) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", jobId);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="draggable-card"
    >
      {children}
    </div>
  );
}

export function DispatchLaneDropZone({ title, targetStatus, children }: { title: string; targetStatus: DispatchDropStatus; children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);
    const jobId = event.dataTransfer.getData("text/plain");
    if (!jobId) return;
    setMessage(null);
    try {
      await updateDispatchStatus(jobId, targetStatus);
      setMessage(`Moved to ${title}.`);
      router.refresh();
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <div
      className={active ? "drop-zone active" : "drop-zone"}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={drop}
      aria-label={`Drop a job here to move it to ${title}`}
    >
      {children}
      {message && <p className={message.startsWith("Error") ? "notice error" : "notice success"}>{message}</p>}
    </div>
  );
}
