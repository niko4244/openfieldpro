"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type EmailPreviewDTO, type MessageLogDTO } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface MessageSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "invoice" | "estimate";
  documentId: string;
  title: string;
  description?: string;
}

function logState(log: MessageLogDTO): { label: string; className: string } {
  if (log.status === "sent") return { label: "Delivered", className: "bg-green/10 text-green" };
  if (log.status === "failed") return { label: "Failed", className: "bg-red/10 text-red" };
  return { label: "Pending", className: "bg-yellow/10 text-yellow" };
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export function MessageSendDialog({ open, onOpenChange, kind, documentId, title, description }: MessageSendDialogProps) {
  const [preview, setPreview] = useState<EmailPreviewDTO | null>(null);
  const [logs, setLogs] = useState<MessageLogDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [previewResult, logRows] = await Promise.all([
        kind === "invoice" ? api.invoiceEmailPreview(documentId) : api.estimateEmailPreview(documentId),
        api.messageLogs({ kind, documentId }),
      ]);
      setPreview(previewResult);
      setLogs(logRows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to prepare the email");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [open, kind, documentId]);

  useEffect(() => {
    setSendNotice(null);
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send() {
    if (!preview) return;
    setSending(true);
    setSendNotice(null);
    try {
      const result =
        kind === "invoice" ? await api.invoiceSendEmail(documentId) : await api.estimateSendEmail(documentId);
      setSendNotice(
        result.log.status === "sent"
          ? `Email sent to ${result.draft.to}. PDF attached: ${result.attachment.filename} (${Math.max(1, Math.round(result.attachment.sizeBytes / 1024))} KB).`
          : `Delivery failed: ${result.log.error ?? "SMTP rejected the message"}. You can retry from history.`,
      );
      setLogs(await api.messageLogs({ kind, documentId }));
    } catch (err) {
      setSendNotice(`Email not sent: ${err instanceof Error ? err.message : "unexpected error"}`);
    } finally {
      setSending(false);
    }
  }

  async function retry(logId: string) {
    setRetryingId(logId);
    try {
      await api.retryMessage(logId);
      setSendNotice("Retried the failed message.");
      setLogs(await api.messageLogs({ kind, documentId }));
    } catch (err) {
      setSendNotice(`Retry failed: ${err instanceof Error ? err.message : "unexpected error"}`);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="grid gap-3 py-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-red/30 bg-red/5 p-4 text-sm text-red">{loadError}</div>
        ) : preview ? (
          <div className="grid gap-4">
            {sendNotice ? (
              <div className={`rounded-lg border p-3 text-sm ${sendNotice.startsWith("Email sent") || sendNotice.startsWith("Retried") ? "border-green/30 bg-green/10 text-green" : "border-red/30 bg-red/5 text-red"}`}>
                {sendNotice}
              </div>
            ) : null}
            <div className="grid gap-1">
              <p className="text-xs font-medium text-fg-muted">To</p>
              <p className="text-sm text-fg">
                {preview.recipientName} &lt;{preview.to}&gt;
              </p>
            </div>
            <div className="grid gap-1">
              <p className="text-xs font-medium text-fg-muted">Subject</p>
              <p className="text-sm font-semibold text-fg">{preview.subject}</p>
            </div>
            <div className="grid gap-1">
              <p className="text-xs font-medium text-fg-muted">Message</p>
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-100 p-3 text-sm text-fg">{preview.body}</pre>
            </div>

            <div className="grid gap-2">
              <p className="text-xs font-medium text-fg-muted">Delivery history</p>
              {logs.length === 0 ? (
                <p className="text-sm text-fg-muted">No emails sent for this {kind} yet.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border bg-surface-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${logState(log).className}`}>
                          {logState(log).label}
                        </span>
                        <span className="text-sm text-fg">{log.subject}</span>
                      </div>
                      {log.status === "failed" ? (
                        <Button size="sm" variant="secondary" disabled={retryingId === log.id} onClick={() => void retry(log.id)}>
                          {retryingId === log.id ? "Retrying…" : "Retry"}
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      To {log.recipient} · attempt {log.attempts} · {formatWhen(log.lastAttemptAt)}
                    </p>
                    {log.error ? <p className="mt-1 text-xs text-red">{log.error}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button disabled={!preview || sending} onClick={() => void send()}>
          {sending ? "Sending…" : "Send email"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
