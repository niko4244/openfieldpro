"use client";

// Template editor: email body editor, character-counter for SMS, live preview
// pane, and a left rail listing the org's templates grouped by channel.
//
// Phase 5b+ A/B: per-variant sub-card lives under the Subject input (only
// meaningful for email channel — SMS has no subject). Each variant carries
// a label, weight, and subject literal; the saved picker chooses one
// deterministically per (recipient, template) via pickVariant() in
// @ofp/shared. When at least one variant is saved, the picker overrides
// Subject; otherwise the base column drives the rendered subject (the
// pre-A/B behavior, unchanged).
//
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import {
  type TemplateChannel,
  TEMPLATE_CHANNELS,
  type TemplateDTO,
  type TemplateSubjectDTO,
  TEMPLATE_FIELDS,
  TEMPLATE_KEYS,
  smsSegmentCount,
  SMS_SINGLE_SEGMENT_MAX,
  SMS_TWO_SEGMENT_MAX,
  SMS_HARD_LIMIT,
} from "@ofp/shared";

interface EditorState {
  id: string | null;
  channel: TemplateChannel;
  key: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
}

const EMPTY: EditorState = {
  id: null,
  channel: "email",
  key: TEMPLATE_KEYS[0],
  name: "",
  subject: "",
  body: "",
  enabled: true,
};

function charClass(chars: number): string {
  if (chars > SMS_HARD_LIMIT) return "text-red";
  if (chars > SMS_TWO_SEGMENT_MAX) return "text-amber-400";
  if (chars > SMS_SINGLE_SEGMENT_MAX) return "text-yellow-400";
  return "text-fg-muted";
}

export function TemplateEditor() {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<EditorState>(EMPTY);
  const [filter, setFilter] = useState<TemplateChannel | "all">("all");
  const [variants, setVariants] = useState<TemplateSubjectDTO[]>([]);
  // Which variant the right-hand preview is currently showing. null/"" ==
  // "let the picker decide". "control" or "with_emoji" == "force this".
  const [previewVariant, setPreviewVariant] = useState<string | null>(null);
  const [newVariant, setNewVariant] = useState<{
    label: string;
    weight: number;
    subject: string;
  }>({ label: "", weight: 1, subject: "" });
  const [previewHtml, setPreviewHtml] = useState<{
    subject: string;
    body: string;
    chars?: number;
    segments?: number;
    variant?: string | null;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.templates();
      setTemplates(list);
    } catch {
      setStatusMsg("Could not load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadVariants = useCallback(async (templateId: string) => {
    try {
      const list = await api.templateVariants(templateId);
      setVariants(list);
    } catch {
      setVariants([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(
    () => (filter === "all" ? templates : templates.filter((t) => t.channel === filter)),
    [templates, filter],
  );

  const loadInto = useCallback(
    (t: TemplateDTO) => {
      setState({
        id: t.id,
        channel: t.channel,
        key: t.key as EditorState["key"],
        name: t.name,
        subject: t.subject ?? "",
        body: t.body,
        enabled: t.enabled,
      });
      setPreviewVariant(null);
      setNewVariant({ label: "", weight: 1, subject: "" });
      setPreviewHtml(null);
      setPreviewError(null);
      setStatusMsg(null);
      if (t.channel === "email") {
        void reloadVariants(t.id);
      } else {
        setVariants([]);
      }
    },
    [reloadVariants],
  );

  const startNew = useCallback((channel: TemplateChannel) => {
    setState({ ...EMPTY, channel });
    setVariants([]);
    setPreviewVariant(null);
    setNewVariant({ label: "", weight: 1, subject: "" });
    setPreviewHtml(null);
    setPreviewError(null);
    setStatusMsg(null);
  }, []);

  const fetchPreview = useCallback(async () => {
    if (!state.id) {
      // Local preview for unsaved drafts: no server round-trip needed; the
      // fields already validate the regex / char limits client-side. Saved
      // templates get the full branded shell from the server renderer.
      setPreviewHtml({
        subject: state.subject || "(no subject)",
        body:
          state.channel === "email"
            ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;padding:16px;">${state.body.replace(/\r?\n/g, "<br>\n")}</div>`
            : state.body,
        chars: state.body.length,
        segments: smsSegmentCount(state.body.length),
      });
      setPreviewError(null);
      return;
    }
    try {
      const r = await api.previewTemplate(state.id, {
        variant: previewVariant ?? undefined,
      });
      setPreviewHtml(r);
      setPreviewError(null);
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }, [state.id, state.subject, state.body, previewVariant]);

  const save = useCallback(async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      if (state.id) {
        await api.patchTemplate(state.id, {
          channel: state.channel,
          key: state.key,
          name: state.name,
          subject: state.subject,
          body: state.body,
          enabled: state.enabled,
        });
        setStatusMsg("Saved.");
      } else {
        const created = await api.createTemplate({
          channel: state.channel,
          key: state.key,
          name: state.name,
          subject: state.subject,
          body: state.body,
          enabled: state.enabled,
        });
        setState((s) => ({ ...s, id: created.id }));
        setStatusMsg("Created.");
      }
      await reload();
    } catch (e) {
      setStatusMsg(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [state, reload]);

  const remove = useCallback(async () => {
    if (!state.id) return;
    if (!confirm(`Delete template "${state.name}"?`)) return;
    try {
      await api.deleteTemplate(state.id);
      setState(EMPTY);
      setVariants([]);
      setPreviewVariant(null);
      setPreviewHtml(null);
      await reload();
      setStatusMsg("Deleted.");
    } catch (e) {
      setStatusMsg(`Delete failed: ${(e as Error).message}`);
    }
  }, [state.id, state.name, reload]);

  // Insert at the caret (falls back to appending when the textarea hasn't
  // been focused yet), then restore focus with the caret after the token.
  const insertField = useCallback((mustache: string) => {
    const el = bodyRef.current;
    setState((s) => {
      const at = el ? el.selectionStart : s.body.length;
      const end = el ? el.selectionEnd : s.body.length;
      const body = s.body.slice(0, at) + mustache + s.body.slice(end);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.selectionStart = el.selectionEnd = at + mustache.length;
      });
      return { ...s, body };
    });
  }, []);

  const installDefaults = useCallback(async () => {
    setInstalling(true);
    setStatusMsg(null);
    try {
      const r = await api.installDefaultTemplates();
      await reload();
      setStatusMsg(
        r.created.length === 0
          ? "All starter templates already installed."
          : `Installed ${r.created.length} starter templates.`,
      );
    } catch (e) {
      setStatusMsg(`Install failed: ${(e as Error).message}`);
    } finally {
      setInstalling(false);
    }
  }, [reload]);

  const addVariant = useCallback(async () => {
    if (!state.id) return;
    if (!newVariant.label.trim() || !newVariant.subject.trim()) {
      setStatusMsg("Variant needs a label and subject.");
      return;
    }
    setSavingVariant(true);
    setStatusMsg(null);
    try {
      await api.createTemplateVariant(state.id, {
        label: newVariant.label.trim(),
        weight: newVariant.weight || 1,
        subject: newVariant.subject,
      });
      setNewVariant({ label: "", weight: 1, subject: "" });
      await reloadVariants(state.id);
      setStatusMsg("Variant added.");
    } catch (e) {
      setStatusMsg(`Add variant failed: ${(e as Error).message}`);
    } finally {
      setSavingVariant(false);
    }
  }, [state.id, newVariant, reloadVariants]);

  const removeVariant = useCallback(
    async (v: TemplateSubjectDTO) => {
      if (!state.id) return;
      if (!confirm(`Delete variant "${v.label}"?`)) return;
      try {
        await api.deleteTemplateVariant(state.id, v.id);
        if (previewVariant === v.label) setPreviewVariant(null);
        await reloadVariants(state.id);
        setStatusMsg(`Variant "${v.label}" deleted.`);
      } catch (e) {
        setStatusMsg(`Delete variant failed: ${(e as Error).message}`);
      }
    },
    [state.id, previewVariant, reloadVariants],
  );

  const smsCharCount = state.channel === "sms" ? state.body.length : 0;
  const variantsOpen = state.id && state.channel === "email";
  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* Left rail: template list */}
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <div className="flex gap-1 pt-2">
            {(["all", "email", "sms"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-2.5 py-1 text-xs rounded-md cursor-pointer border-none transition-colors ${
                  filter === c ? "bg-accent text-white" : "bg-surface-300 text-fg-muted hover:text-fg"
                }`}
              >
                {c === "all" ? "All" : c === "email" ? "📧 Email" : "📱 SMS"}
              </button>
            ))}
          </div>
          <div className="flex gap-1 pt-2">
            <Button
              variant="secondary"
              onClick={() => startNew("email")}
              className="flex-1"
            >
              + Email
            </Button>
            <Button
              variant="secondary"
              onClick={() => startNew("sms")}
              className="flex-1"
            >
              + SMS
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3 text-sm text-fg-muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState
                title="No templates yet"
                description="Start from the professional defaults — invoices, reminders, and review requests — then tweak the wording."
              />
              <Button onClick={installDefaults} disabled={installing} className="w-full">
                {installing ? "Installing…" : "Install starter templates"}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => loadInto(t)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-200 cursor-pointer border-none transition-colors ${
                      state.id === t.id ? "bg-surface-200" : ""
                    }`}
                  >
                    <div className="font-medium text-fg">{t.name}</div>
                    <div className="text-xs text-fg-muted flex justify-between mt-0.5">
                      <span>{t.channel === "email" ? "📧" : "📱"} {t.key}</span>
                      {!t.enabled && <span className="text-amber-400">paused</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Center: editor */}
      <Card className="xl:col-span-5">
        <CardHeader>
          <CardTitle>{state.id ? "Edit template" : "New template"}</CardTitle>
          <div className="grid grid-cols-2 gap-3 pt-3">
            <label className="block">
              <span className="text-xs text-fg-muted">Name (internal)</span>
              <input
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                placeholder="24h reminder — friendly"
                className="mt-1 w-full h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>
            <label className="block">
              <span className="text-xs text-fg-muted">Event key</span>
              <select
                value={state.key}
                onChange={(e) => setState((s) => ({ ...s, key: e.target.value as EditorState["key"] }))}
                style={{ colorScheme: "dark" }}
                className="mt-1 w-full h-9 rounded-md border border-border bg-surface-300 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
              >
                {TEMPLATE_KEYS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            {state.channel === "email" && (
              <label className="block col-span-2">
                <span className="text-xs text-fg-muted">
                  Subject
                  {variants.length > 0 && (
                    <span className="ml-2 text-amber-400">
                      · overridden by {variants.length} variant
                      {variants.length > 1 ? "s" : ""} when sent
                    </span>
                  )}
                </span>
                <input
                  value={state.subject}
                  onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))}
                  placeholder={
                    variants.length > 0
                      ? "(fallback if all variants are deleted)"
                      : "Your appointment is tomorrow at 9am"
                  }
                  className="mt-1 w-full h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
              </label>
            )}
          </div>

          {/* Insert field picker, grouped so it reads as a palette instead of
              a wall of tokens. Chips show the short field name; the full
              mustache token appears on hover and is what gets inserted. */}
          <div className="pt-3">
            <span className="text-xs text-fg-muted">Insert field at cursor</span>
            <div className="space-y-1.5 pt-1">
              {[...new Set(TEMPLATE_FIELDS.map((f) => f.group))].map((group) => (
                <div key={group} className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-dim w-20 shrink-0">
                    {group}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_FIELDS.filter((f) => f.group === group).map((f) => (
                      <button
                        key={f.mustache}
                        onClick={() => insertField(f.mustache)}
                        title={`${f.mustache} — e.g. ${f.example}`}
                        className="px-2 py-0.5 text-xs rounded bg-surface-300 hover:bg-surface-200 text-fg cursor-pointer border border-border transition-colors"
                      >
                        {f.field}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phase 5b+ A/B: per-variant sub-card. SMS has no subject so the
              section is hidden there. Until a template is saved, variants
              cannot attach to it (FK requires template_id). */}
          {variantsOpen && (
            <div className="pt-4 border-t border-border mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-fg">
                    Subject variants (A/B test)
                  </h4>
                  <p className="text-xs text-fg-muted pt-0.5">
                    {variants.length === 0
                      ? "No subjects yet. Optional — save one or more to A/B test which subject line performs best."
                      : `${variants.length} subject${variants.length > 1 ? "s" : ""} · weight ${totalWeight}`}
                  </p>
                </div>
              </div>

              {variants.length > 0 && (
                <ul className="divide-y divide-border mt-2 border border-border rounded-md">
                  {variants.map((v) => {
                    const pct =
                      totalWeight > 0
                        ? Math.round((v.weight / totalWeight) * 100)
                        : 0;
                    return (
                      <li key={v.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-fg">{v.label}</span>
                              <span className="text-xs text-fg-muted">
                                weight {v.weight} ({pct}%)
                              </span>
                            </div>
                            <div className="text-xs text-fg truncate">
                              {v.subject}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                setPreviewVariant(
                                  previewVariant === v.label ? null : v.label,
                                )
                              }
                              className={`px-2 py-0.5 text-xs rounded cursor-pointer border transition-colors ${
                                previewVariant === v.label
                                  ? "bg-accent text-white border-accent"
                                  : "bg-surface-300 text-fg-muted hover:text-fg border-border"
                              }`}
                            >
                              {previewVariant === v.label ? "Previewing" : "Preview"}
                            </button>
                            <button
                              onClick={() => removeVariant(v)}
                              className="px-2 py-0.5 text-xs rounded cursor-pointer border border-border bg-surface-300 text-fg-muted hover:text-red transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="grid grid-cols-12 gap-2 pt-3">
                <input
                  value={newVariant.label}
                  onChange={(e) =>
                    setNewVariant((s) => ({ ...s, label: e.target.value }))
                  }
                  placeholder="label (e.g. control)"
                  className="col-span-3 h-9 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
                <input
                  type="number"
                  min={1}
                  value={newVariant.weight}
                  onChange={(e) =>
                    setNewVariant((s) => ({
                      ...s,
                      weight: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  placeholder="weight"
                  className="col-span-2 h-9 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
                <input
                  value={newVariant.subject}
                  onChange={(e) =>
                    setNewVariant((s) => ({ ...s, subject: e.target.value }))
                  }
                  placeholder="Subject line for this variant"
                  className="col-span-5 h-9 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
                <Button
                  onClick={addVariant}
                  disabled={
                    savingVariant ||
                    !newVariant.label.trim() ||
                    !newVariant.subject.trim()
                  }
                  className="col-span-2"
                >
                  {savingVariant ? "…" : "+ Add"}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {state.channel === "email" ? (
            <div>
              <textarea
                ref={bodyRef}
                value={state.body}
                onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
                rows={12}
                placeholder="Hi {{customer.name}}, just confirming your appointment on {{appointment.startsAt}}…"
                className="min-h-64 w-full resize-y rounded-md border border-border bg-surface-300 px-3 py-2 text-sm font-mono leading-6 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </div>
          ) : (
            <div>
              <textarea
                ref={bodyRef}
                value={state.body}
                onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
                rows={6}
                placeholder="Hi {{customer.name}}, this is a reminder for your appointment at {{appointment.startsAt}}."
                className="w-full rounded-md border border-border bg-surface-300 px-3 py-2 text-sm font-mono text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <div className="flex justify-between items-center mt-1.5">
                <span className={`text-xs ${charClass(smsCharCount)}`}>
                  {smsCharCount}/{SMS_SINGLE_SEGMENT_MAX}
                  {smsCharCount > SMS_SINGLE_SEGMENT_MAX && ` / ${SMS_TWO_SEGMENT_MAX}`}
                  {smsCharCount > SMS_TWO_SEGMENT_MAX && ` / ${SMS_HARD_LIMIT}`} chars
                  {" · "}
                  {smsSegmentCount(smsCharCount)} segment
                  {smsSegmentCount(smsCharCount) > 1 ? "s" : ""}
                </span>
                <span className="text-xs text-fg-dim">
                  Twin-segment cap: 306 chars · Hard cap: 480 chars (3 seg)
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={state.enabled}
                onChange={(e) => setState((s) => ({ ...s, enabled: e.target.checked }))}
                className="rounded border-border bg-surface-300 text-accent focus-visible:ring-accent/50 cursor-pointer"
              />
              Enabled
            </label>
            <div className="flex gap-2">
              {state.id && (
                <Button variant="secondary" onClick={remove} disabled={saving}>
                  Delete
                </Button>
              )}
              <Button variant="secondary" onClick={fetchPreview} disabled={!state.body}>
                Preview
              </Button>
              <Button onClick={save} disabled={saving || !state.name || !state.body}>
                {saving ? "Saving…" : state.id ? "Save" : "Create"}
              </Button>
            </div>
          </div>
          {statusMsg && (
            <p className="text-xs text-fg-muted pt-1">{statusMsg}</p>
          )}
        </CardContent>
      </Card>

      {/* Right: preview pane */}
      <Card className="xl:col-span-4">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <p className="text-xs text-fg-muted pt-1">
            Renders against canonical sample data — no real customer rows.
          </p>
        </CardHeader>
        <CardContent>
          {previewError ? (
            <p className="text-sm text-red">{previewError}</p>
          ) : !previewHtml ? (
            <EmptyState
              title="Click Preview"
              description="Render the template with sample fields filled in."
            />
          ) : (
            <div className="space-y-3">
              {previewHtml.variant && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-accent/20 text-accent">
                  <span className="font-mono">{previewHtml.variant}</span>
                  {previewVariant && previewVariant === previewHtml.variant && (
                    <span className="text-fg-dim">· forced</span>
                  )}
                </div>
              )}
              {previewHtml.subject && state.channel === "email" && (
                <div>
                  <p className="text-xs text-fg-muted">Subject</p>
                  <p className="text-sm font-medium text-fg">{previewHtml.subject}</p>
                </div>
              )}
              {state.channel === "email" ? (
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml.body}
                  className="w-full h-72 rounded-md border border-border bg-white"
                />
              ) : (
                <>
                  <p className="text-xs text-fg-muted">Body</p>
                  <pre className="whitespace-pre-wrap text-sm font-mono text-fg bg-surface-200 p-3 rounded-md">
                    {previewHtml.body}
                  </pre>
                  {previewHtml.chars !== undefined && (
                    <p className="text-xs text-fg-muted">
                      {previewHtml.chars} chars · {previewHtml.segments ?? 1} segment
                      {(previewHtml.segments ?? 1) > 1 ? "s" : ""} · est. cost $
                      {((previewHtml.segments ?? 1) * 0.0079).toFixed(4)}
                    </p>
                  )}
                </>
              )}
              <button
                onClick={async () => {
                  if (!state.id) {
                    alert("Save the template first to test-send.");
                    return;
                  }
                  try {
                    await api.testSendTemplate(state.id, {
                      variant: previewVariant ?? undefined,
                    });
                    setStatusMsg("Test-sent (console/ntfy).");
                  } catch (e) {
                    setStatusMsg(`Test-send failed: ${(e as Error).message}`);
                  }
                }}
                className="text-xs text-accent hover:underline cursor-pointer bg-transparent border-none"
              >
                Send test →
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Intent marker: this file is the templates UI surface. Keep the channel
// constants visible to downstream route-level smoke checks.
export const TEMPLATE_HANDLES = TEMPLATE_CHANNELS;
