"use client";

// Automation rules UI: list table with last-run status, plus a Drawer for
// create/edit. Phase 5c — ships against POST/PATCH/DELETE /api/automation/rules.
//
// Key display decisions:
// - lastRun.status='pending' renders as a distinct "firing…" badge (gray,
//   same family as dim/skipped) so an admin can see in-flight optimistic
//   audit rows. Without an explicit pending style, 'pending' would be
//   indistinguishable from 'skipped' and mislead operators.
// - The Drawer preloads templates so the templateId dropdown is a real
//   picker, not a free-text field. Templates are loaded once on mount via
//   the existing api() client.
//
// ponytail: EVENT_KEYS duplicated from apps/api/src/routes/automation.ts.
//   Ceiling: 3 surfaces out-of-sync is exactly the bug class we want to
//   avoid. Upgrade: hoist into @ofp/shared (mirror of TEMPLATE_KEYS).
//   Tracked by the same ponytail block in lib/api.ts.
//
// ponytail: conditionFn is accepted as free-text today because no
//   real rule engine ships in Phase 5c. Ceiling: admins will start
//   putting wishful thinking in this field. Upgrade: ship a real
//   expression evaluator in packages/db and gate the API on it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EVENT_KEYS = [
  "appointment.created",
  "appointment.scheduled",
  "invoice.created",
  "invoice.paid",
  "payment.received",
  "job.scheduled",
  "job.completed",
  "job.canceled",
  "review.request",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

type RuleChannel = "email" | "sms";

interface RunStatus {
  status: "pending" | "fired" | "failed" | "skipped";
  firedAt: string;
  variantLabel: string | null;
  error: string | null;
}

interface RuleDTO {
  id: string;
  orgId: string;
  name: string;
  eventKey: string;
  channel: RuleChannel;
  templateId: string;
  conditionFn: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: RunStatus | null;
}

interface TemplateLite {
  id: string;
  channel: RuleChannel;
  name: string;
  key: string;
}

function RunStatusBadge({
  status,
  firedAt,
}: {
  status: RunStatus["status"];
  firedAt?: string;
}) {
  // Distinct variant per status so pending is visually separable from
  // skipped (both gray-family but pending = 'firing…' optimistic audit,
  // skipped = 'dedupe-gate' reservation). The title surfaces the
  // underlying timestamp so an admin can correlate against the audit log.
  const variant =
    status === "fired"
      ? "completed"
      : status === "failed"
        ? "canceled"
        : status === "pending"
          ? "lead"
          : "default";
  const label =
    status === "pending"
      ? "firing…"
      : status === "fired"
        ? "fired"
        : status === "failed"
          ? "failed"
          : "skipped";
  return (
    <Badge variant={variant} title={firedAt}>
      {label}
    </Badge>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

function findEventKey(value: string): EventKey {
  return (EVENT_KEYS as readonly string[]).includes(value)
    ? (value as EventKey)
    : "invoice.paid";
}

export function AutomationRules() {
  const [rules, setRules] = useState<RuleDTO[] | null>(null);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RuleDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RuleDTO | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.automationRules();
      setRules(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load rules");
      setRules([]); // show empty state rather than perpetual loader on error
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Templates are loaded once — they power the drawer's templateId picker.
  // Failure here is silent (the drawer falls back to typing the id),
  // because not every viewer is a template admin.
  useEffect(() => {
    api
      .templates()
      .then((list) =>
        setTemplates(
          list.map((t) => ({
            id: t.id,
            channel: t.channel,
            name: t.name,
            key: t.key,
          })),
        ),
      )
      .catch(() => {
        /* drawer will be a free-text fallback */
      });
  }, []);

  const drawerOpen = editing !== null || creating;

  const closeDrawer = useCallback(() => {
    setEditing(null);
    setCreating(false);
  }, []);

  const handleSaved = useCallback(
    async (verb: "Created" | "Saved") => {
      setStatusMsg(`${verb}.`);
      closeDrawer();
      await reload();
    },
    [closeDrawer, reload],
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteAutomationRule(confirmDelete.id);
      setStatusMsg(`Deleted "${confirmDelete.name}".`);
      setConfirmDelete(null);
      await reload();
    } catch (e) {
      setStatusMsg(`Delete failed: ${(e as Error).message}`);
    }
  }, [confirmDelete, reload]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-fg-muted">
            Fire a template when a domain event happens. The last-run column
            shows what the most recent fire actually did (fired / failed /
            skipped / firing… optimistic).
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ New rule</Button>
      </div>

      {error && (
        <Card className="border-red/30 bg-red/5">
          <CardContent className="p-4">
            <p className="text-sm text-red">{error}</p>
          </CardContent>
        </Card>
      )}

      {rules === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <EmptyState
              title="No automation rules yet"
              description="Click + New rule to fire a template on a domain event."
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="w-20">On?</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="w-32">Created</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-fg">
                    {r.name}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-fg-muted">{r.eventKey}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.channel === "email" ? "scheduled" : "in_progress"}>
                      {r.channel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-fg-muted font-mono">
                    {templates.find((t) => t.id === r.templateId)?.name ??
                      `${r.templateId.slice(0, 8)}…`}
                  </TableCell>
                  <TableCell>
                    {r.enabled ? (
                      <Badge variant="completed">on</Badge>
                    ) : (
                      <Badge variant="default">off</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.lastRun ? (
                      <div className="flex items-center gap-2">
                        <RunStatusBadge
                          status={r.lastRun.status}
                          firedAt={r.lastRun.firedAt}
                        />
                        <span
                          className="text-xs text-fg-dim"
                          title={r.lastRun.firedAt}
                        >
                          {relativeTime(r.lastRun.firedAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-fg-dim">never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-fg-dim">
                    {relativeTime(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(r)}
                        className="text-xs text-accent hover:underline cursor-pointer bg-transparent border-none"
                      >
                        Edit
                      </button>
                      {confirmDelete?.id === r.id ? (
                        <button
                          onClick={handleDelete}
                          className="text-xs text-red hover:text-red/80 cursor-pointer bg-transparent border-none"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(r)}
                          className="text-xs text-fg-muted hover:text-red cursor-pointer bg-transparent border-none transition-colors"
                        >
                          Delete
                        </button>
                      )}
                      {confirmDelete?.id === r.id && (
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-fg-muted hover:text-fg cursor-pointer bg-transparent border-none"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {statusMsg && <p className="text-xs text-fg-muted">{statusMsg}</p>}

      <RuleDrawer
        open={drawerOpen}
        initial={editing}
        templates={templates}
        onClose={closeDrawer}
        onSaved={handleSaved}
      />
    </div>
  );
}

// ── Drawer (create / edit) ──

interface RuleFormState {
  name: string;
  eventKey: EventKey;
  channel: RuleChannel;
  templateId: string;
  conditionFn: string;
  enabled: boolean;
}

const EMPTY_FORM: RuleFormState = {
  name: "",
  eventKey: "invoice.paid",
  channel: "email",
  templateId: "",
  conditionFn: "",
  enabled: true,
};

function RuleDrawer({
  open,
  initial,
  templates,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: RuleDTO | null;
  templates: TemplateLite[];
  onClose: () => void;
  onSaved: (verb: "Created" | "Saved") => void | Promise<void>;
}) {
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-seed the form whenever the drawer is opened for a different row.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        eventKey: findEventKey(initial.eventKey),
        channel: initial.channel,
        templateId: initial.templateId,
        conditionFn: initial.conditionFn ?? "",
        enabled: initial.enabled,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErr(null);
  }, [open, initial]);

  const templatesForChannel = useMemo(
    () => templates.filter((t) => t.channel === form.channel),
    [templates, form.channel],
  );

  // If the active templateId is wrong for the just-changed channel, drop it
  // so the dropdown isn't pre-selected on a template the picker can't show.
  useEffect(() => {
    if (!form.templateId) return;
    if (!templatesForChannel.some((t) => t.id === form.templateId)) {
      setForm((f) => ({ ...f, templateId: "" }));
    }
  }, [form.templateId, templatesForChannel]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setErr(null);
    try {
      if (initial) {
        await api.patchAutomationRule(initial.id, {
          name: form.name,
          eventKey: form.eventKey,
          channel: form.channel,
          templateId: form.templateId,
          conditionFn: form.conditionFn.trim() || null,
          enabled: form.enabled,
        });
        await onSaved("Saved");
      } else {
        await api.createAutomationRule({
          name: form.name,
          eventKey: form.eventKey,
          channel: form.channel,
          templateId: form.templateId,
          conditionFn: form.conditionFn.trim() || null,
          enabled: form.enabled,
        });
        await onSaved("Created");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [form, initial, onSaved]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit rule" : "New automation rule"}
          </DialogTitle>
          <DialogDescription>
            Fires a template when the event matches. Weights on the
            template&apos;s subject variants are honored automatically — no
            extra config here.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <label className="block col-span-2">
            <span className="text-xs text-fg-muted">Name (internal handle)</span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Send receipt when invoice paid"
              className="mt-1"
            />
          </label>

          <label className="block">
            <span className="text-xs text-fg-muted">Event</span>
            <select
              value={form.eventKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, eventKey: e.target.value as EventKey }))
              }
              style={{ colorScheme: "dark" }}
              className="mt-1 w-full h-10 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
            >
              {EVENT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-fg-muted">Channel</span>
            <select
              value={form.channel}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  channel: e.target.value as RuleChannel,
                }))
              }
              style={{ colorScheme: "dark" }}
              className="mt-1 w-full h-10 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
            >
              <option value="email">email</option>
              <option value="sms">sms</option>
            </select>
          </label>

          <label className="block col-span-2">
            <span className="text-xs text-fg-muted">Template</span>
            {templatesForChannel.length > 0 ? (
              <select
                value={form.templateId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, templateId: e.target.value }))
                }
                style={{ colorScheme: "dark" }}
                className="mt-1 w-full h-10 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
              >
                <option value="">— select a template —</option>
                {templatesForChannel.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.key})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={form.templateId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, templateId: e.target.value }))
                }
                placeholder="template id (uuid)"
                className="mt-1 font-mono text-xs"
              />
            )}
          </label>

          <label className="block col-span-2">
            <span className="text-xs text-fg-muted">
              Condition (optional, free-text)
            </span>
            <Input
              value={form.conditionFn}
              onChange={(e) =>
                setForm((f) => ({ ...f, conditionFn: e.target.value }))
              }
              placeholder="e.g. amount > 100"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-xs text-fg-dim mt-1">
              ponytail: parsed by a future rule engine. Today an empty value
              means &quot;always fire&quot;.
            </p>
          </label>

          <label className="flex items-center gap-2 col-span-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, enabled: e.target.checked }))
              }
              className="rounded border-border bg-surface-300 text-accent focus-visible:ring-accent/50 cursor-pointer"
            />
            Enabled (unchecked rules stay saved but never fire)
          </label>

          {err && <p className="col-span-2 text-xs text-red">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim() || !form.templateId}
          >
            {saving ? "Saving…" : initial ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
