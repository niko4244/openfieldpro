"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  events: string[];
  scopes: string[];
  transform: string;
  firstParty: boolean;
  installed: boolean;
  installId: string | null;
  enabled: boolean;
  requiredPlan: string;
  planSatisfied: boolean;
}

// Tailored placeholder so notifier installs know exactly what URL to paste.
const WEBHOOK_PLACEHOLDER: Record<string, string> = {
  slack: "https://hooks.slack.com/services/…",
  discord: "https://discord.com/api/webhooks/…",
  ntfy: "https://ntfy.sh/your-topic",
};

interface DeliveryEvent {
  id: string;
  installId: string;
  kind: string;
  status: string;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "completed" | "canceled" | "draft" | "sent"> = {
  delivered: "completed",
  failed: "canceled",
  skipped: "draft",
  pending: "sent",
};

export default function IntegrationsPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [events, setEvents] = useState<DeliveryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Plaintext token shown once, right after install — keyed by plugin id.
  const [freshToken, setFreshToken] = useState<{ pluginId: string; token: string } | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<Record<string, string>>({});

  async function reload() {
    const [c, e] = await Promise.all([api.plugins(), api.pluginEvents()]);
    setCatalog(c);
    setEvents(e as DeliveryEvent[]);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function install(p: CatalogEntry) {
    setBusyId(p.id);
    try {
      const res = await api.installPlugin({ pluginId: p.id, webhookUrl: webhookDraft[p.id] || undefined });
      setFreshToken({ pluginId: p.id, token: res.token });
      await reload();
    } catch { /* surfaced via no state change; keep UI quiet */ }
    setBusyId(null);
  }

  async function toggle(p: CatalogEntry) {
    if (!p.installId) return;
    setBusyId(p.id);
    try {
      await api.patchPluginInstall(p.installId, { enabled: !p.enabled });
      await reload();
    } catch { /* ignore */ }
    setBusyId(null);
  }

  async function uninstall(p: CatalogEntry) {
    if (!p.installId) return;
    setBusyId(p.id);
    try {
      await api.uninstallPlugin(p.installId);
      if (freshToken?.pluginId === p.id) setFreshToken(null);
      await reload();
    } catch { /* ignore */ }
    setBusyId(null);
  }

  async function saveWebhook(p: CatalogEntry) {
    if (!p.installId) return;
    setBusyId(p.id);
    try {
      await api.patchPluginInstall(p.installId, { webhookUrl: webhookDraft[p.id] || null });
      await reload();
    } catch { /* ignore */ }
    setBusyId(null);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect OpenFieldPro to the tools you already use." />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Integrations" description="Connect OpenFieldPro to the tools you already use — open plugin architecture, not a closed store." />

      <div className="grid gap-3 md:grid-cols-2">
        {catalog.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-fg">{p.name}</h3>
                    {p.firstParty && <Badge variant="completed">first-party</Badge>}
                    {p.requiredPlan !== "free" && (
                      <Badge variant="sent">{p.requiredPlan}</Badge>
                    )}
                    {p.installed && (
                      <Badge variant={p.enabled ? "completed" : "draft"}>{p.enabled ? "active" : "paused"}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-fg-muted mt-1">{p.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {p.events.map((e) => (
                  <span key={e} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-300 text-fg-dim">{e}</span>
                ))}
                {p.scopes.map((s) => (
                  <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent">{s}</span>
                ))}
              </div>

              {/* One-time token reveal */}
              {freshToken?.pluginId === p.id && (
                <div className="rounded-lg border border-green/30 bg-green/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-green">API token — copy it now, it won't be shown again</p>
                  <code className="block text-xs font-mono text-fg break-all select-all">{freshToken.token}</code>
                </div>
              )}

              {/* Webhook config (installed only) */}
              {p.installed && (
                <div className="flex gap-2">
                  <Input
                    placeholder={WEBHOOK_PLACEHOLDER[p.transform] ?? "https://your-endpoint/webhook (optional)"}
                    value={webhookDraft[p.id] ?? ""}
                    onChange={(e) => setWebhookDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    className="text-xs"
                  />
                  <Button variant="secondary" disabled={busyId === p.id} onClick={() => saveWebhook(p)}>Save</Button>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {p.installed ? (
                  <>
                    <Button variant="secondary" disabled={busyId === p.id} onClick={() => toggle(p)}>
                      {p.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="ghost" disabled={busyId === p.id} onClick={() => uninstall(p)} className="text-red">
                      Uninstall
                    </Button>
                  </>
                ) : p.planSatisfied ? (
                  <Button disabled={busyId === p.id} onClick={() => install(p)}>
                    {busyId === p.id ? "Installing…" : "Install"}
                  </Button>
                ) : (
                  <a
                    href="/settings"
                    className="text-xs text-accent hover:underline no-underline self-center"
                  >
                    Requires the {p.requiredPlan} plan — activate a license →
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent outbound deliveries */}
      <h2 className="text-sm font-semibold text-fg mt-8 mb-3">Recent deliveries</h2>
      <Card>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <p className="text-sm text-fg-muted p-6 text-center">No events delivered yet. Create a job or take a payment to fire one.</p>
          ) : (
            <div className="divide-y divide-border">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="font-mono text-fg">{e.kind}</span>
                  <div className="flex items-center gap-3">
                    {e.error && <span className="text-fg-dim truncate max-w-[200px]">{e.error}</span>}
                    {e.responseStatus != null && <span className="text-fg-dim">HTTP {e.responseStatus}</span>}
                    <Badge variant={STATUS_VARIANT[e.status] ?? "draft"}>{e.status}</Badge>
                    <span className="text-fg-dim">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
