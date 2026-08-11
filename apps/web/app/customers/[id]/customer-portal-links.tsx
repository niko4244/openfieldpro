"use client";

import { useEffect, useState } from "react";
import { api, type PortalLinkDTO, type PortalLinkScope } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SCOPE_LABELS: Record<PortalLinkScope, string> = {
  balance: "Invoice balance",
  checkout: "Checkout / pay",
  receipts: "Receipts",
  service_plans: "Service plans",
};

const TTL_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "null", label: "No expiration" },
];

function linkState(link: PortalLinkDTO): { label: string; className: string } {
  if (link.revokedAt) return { label: "Revoked", className: "bg-red/10 text-red" };
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return { label: "Expired", className: "bg-red/10 text-red" };
  return { label: "Active", className: "bg-green/10 text-green" };
}

export function CustomerPortalLinks({ customerId }: { customerId: string }) {
  const [links, setLinks] = useState<PortalLinkDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<PortalLinkScope[]>(["balance", "checkout", "receipts", "service_plans"]);
  const [ttl, setTtl] = useState("30");
  const [creating, setCreating] = useState(false);

  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setLinks(await api.portalLinks(customerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load portal links");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  function toggleScope(scope: PortalLinkScope) {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  async function createLink() {
    if (selectedScopes.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createPortalLink({
        customerId,
        scopes: selectedScopes,
        expiresInDays: ttl === "null" ? null : Number(ttl),
      });
      setNewToken(result.token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create portal link");
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    if (!newToken) return;
    const url = `${window.location.origin}/p/${newToken}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      await api.revokePortalLink(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke portal link");
    } finally {
      setRevokingId(null);
    }
  }

  async function send(id: string) {
    setSendingId(id);
    setSendNotice(null);
    setError(null);
    try {
      const result = await api.sendPortalLink(id);
      setSendNotice(`Emailed the portal link to ${result.to}.`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to email the portal link";
      setError(message.replace(/^\d+:\s*/, ""));
    } finally {
      setSendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Customer portal links</CardTitle>
        <Button size="sm" onClick={() => { setNewToken(null); setDialogOpen(true); }}>
          New link
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-fg-muted">Loading portal links…</p>
        ) : error ? (
          <div className="rounded-lg border border-red/30 bg-red/5 p-3">
            <p className="text-sm font-medium text-red">Portal links unavailable</p>
            <p className="mt-1 text-xs text-fg-muted">{error}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sendNotice ? (
              <div role="status" className="rounded-lg border border-green/40 bg-green/10 p-3">
                <p className="text-sm text-green">{sendNotice}</p>
              </div>
            ) : null}
            {links.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface-200 p-4">
                <p className="text-sm font-medium text-fg">No portal link yet.</p>
                <p className="mt-1 text-xs text-fg-muted">
                  Create a signed, expiring link to share the customer’s balance, checkout, receipts, and service plans.
                  You can revoke it at any time.
                </p>
              </div>
            ) : (
              links.map((link) => {
                const state = linkState(link);
                const active = state.label === "Active";
                return (
                  <div key={link.id} className="rounded-xl border border-border bg-surface-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-surface-300 px-2 py-0.5 text-xs font-semibold text-fg">{link.tokenPrefix}…</code>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${state.className}`}>
                          {state.label}
                        </span>
                      </div>
                    <div className="flex items-center gap-2">
                      {active ? (
                        <>
                          <Button size="sm" variant="secondary" disabled={sendingId === link.id} onClick={() => void send(link.id)}>
                            {sendingId === link.id ? "Sending…" : "Send email"}
                          </Button>
                          {revokingId === link.id ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setRevokingId(null)}>Keep</Button>
                              <Button size="sm" variant="danger" onClick={() => void revoke(link.id)}>Confirm revoke</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setRevokingId(link.id)}>Revoke</Button>
                          )}
                        </>
                      ) : null}
                    </div>
                    </div>
                    <p className="mt-2 text-xs text-fg-muted">
                      {link.scopes.map((scope) => SCOPE_LABELS[scope]).join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-fg-dim">
                      {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()} · ` : "No expiration · "}
                      {link.lastUsedAt ? `last used ${new Date(link.lastUsedAt).toLocaleDateString()} · ` : "never used · "}
                      {link.sentCount > 0 ? `emailed ${link.sentCount}×${link.lastSentAt ? ` (${new Date(link.lastSentAt).toLocaleDateString()})` : ""}` : "not yet emailed"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!creating) setDialogOpen(open); }}>
        <DialogHeader>
          <DialogTitle>New customer portal link</DialogTitle>
          <DialogDescription>
            Choose which views this link opens. The link expires automatically and can be revoked at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-dim">Views</legend>
            {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
              <label key={scope} className="flex items-center gap-3 rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope as PortalLinkScope)}
                  onChange={() => toggleScope(scope as PortalLinkScope)}
                  className="h-4 w-4 accent-accent"
                />
                {label}
              </label>
            ))}
            {selectedScopes.length === 0 ? (
              <p className="text-xs text-red">Select at least one view.</p>
            ) : null}
          </fieldset>

          <label className="mt-4 block text-sm text-fg">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-dim">Expiration</span>
            <select value={ttl} onChange={(event) => setTtl(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface-300 px-3 text-sm text-fg">
              {TTL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {newToken ? (
            <div className="mt-4 rounded-xl border border-green/40 bg-green/10 p-4">
              <p className="text-sm font-semibold text-green">Portal link created</p>
              <p className="mt-1 text-xs text-fg-muted">
                Share this link with the customer. It is shown only once — copy it now.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-300 px-3 py-2 text-xs text-fg" data-testid="new-portal-link">
                  {window.location.origin}/p/{newToken}
                </code>
                <Button size="sm" variant="secondary" onClick={() => void copyToken()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>Close</Button>
          {newToken ? null : (
            <Button onClick={() => void createLink()} disabled={selectedScopes.length === 0 || creating}>
              {creating ? "Creating…" : "Create link"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
