"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@ofp/shared";
import type { PublicApprovalDTO } from "@ofp/shared";
import { api } from "@/lib/api";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";

export default function ApprovalPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [data, setData] = useState<PublicApprovalDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [signerName, setSignerName] = useState("");
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [padEmpty, setPadEmpty] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await api.fetchPublicApproval(token);
        if (!cancelled) {
          setData(payload);
          if (payload.estimate.accepted) {
            setSigned(true);
            setAlreadyAccepted(true);
          }
        }
      } catch (e) {
        const msg = (e as Error).message ?? "Unable to load this approval link";
        if (!cancelled) setError(/^404:/.test(msg) ? "This approval link is invalid or has expired." : msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async () => {
    const sig = padRef.current?.exportDataUrl();
    if (!sig || !signerName.trim()) return;
    setSigning(true);
    setError(null);
    try {
      const r = await api.submitApproval(token, {
        signerName: signerName.trim(),
        signatureData: sig,
      });
      setSigned(true);
      setAlreadyAccepted(r.alreadyAccepted);
      // Refresh the page data so estimation/edit flows reflect new state on rerender.
      try {
        const fresh = await api.fetchPublicApproval(token);
        setData(fresh);
      } catch {
        /* ignore — we already succeeded once */
      }
    } catch (e) {
      setError((e as Error).message ?? "Failed to submit approval");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Skeleton className="h-12 w-64 mb-4" />
        <Skeleton className="h-64 rounded-xl mb-4" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Card>
          <EmptyState
            title="Approval link unavailable"
            description={error}
          />
          <div className="text-center text-xs text-fg-dim pb-6">
            Need help? Contact the business that sent you this link.
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { estimate, job, customer, org, lineItems } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      {/* Document-style header (no sidebar, no nav). */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-fg">Estimate Approval</h1>
        {org?.name && <p className="text-sm text-fg-muted mt-1">from {org.name}</p>}
      </header>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-fg-dim">Job</p>
              <p className="text-lg font-semibold text-fg mt-1">{job.title}</p>
              {job.description && (
                <p className="text-sm text-fg-muted mt-2 whitespace-pre-line">{job.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs uppercase tracking-wider text-fg-dim">Total</p>
              <p className="text-2xl font-semibold text-fg tabular-nums mt-1">
                {formatMoney(estimate.total)}
              </p>
            </div>
          </div>
          {lineItems.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-wider text-fg-dim mb-2">Line Items</p>
              <div className="divide-y divide-border">
                {lineItems.map((li) => (
                  <div key={li.id} className="flex justify-between py-2 text-sm">
                    <span className="text-fg">{li.description}</span>
                    <span className="text-fg-muted tabular-nums">
                      {li.quantity} × {formatMoney(li.unitPrice)}{" "}
                      <span className="text-fg-dim">= {formatMoney(li.quantity * li.unitPrice)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-6">
          <p className="text-xs uppercase tracking-wider text-fg-dim mb-2">Prepared For</p>
          <p className="text-sm text-fg">{customer.name}</p>
          {customer.email && <p className="text-xs text-fg-muted mt-1">{customer.email}</p>}
          {customer.phone && <p className="text-xs text-fg-muted">{customer.phone}</p>}
        </CardContent>
      </Card>

      {signed ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-2xl font-semibold text-green">
              {alreadyAccepted ? "Already Approved ✓" : "Approved ✓"}
            </p>
            <p className="text-sm text-fg-muted mt-2">
              Thanks {data.estimate.signedBy ?? ""} — we'll be in touch to schedule the work.
            </p>
            {data.estimate.signedAt && (
              <p className="text-xs text-fg-dim mt-3">
                Signed at {new Date(data.estimate.signedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wider text-fg-dim mb-2">Approve &amp; Sign</p>
            <p className="text-sm text-fg-muted mb-4">
              Sign below to accept the estimate. Approved estimates move to scheduled and the team will reach
              out to confirm timing.
            </p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                Full Name (printed signature)
              </label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="e.g. Jane Homeowner"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                Signature
              </label>
              <SignaturePad ref={padRef} onChange={setPadEmpty} height={220} />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="text-xs px-2 py-1 rounded bg-surface-300 text-fg-muted hover:text-fg hover:bg-surface-400 transition-colors cursor-pointer border-none"
                >
                  Clear
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red mb-3 p-2 rounded bg-red/5">{error}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={padEmpty || !signerName.trim() || signing}
              className="w-full"
            >
              {signing ? "Submitting…" : "Approve Estimate"}
            </Button>
          </CardContent>
        </Card>
      )}

      <footer className="text-center text-xs text-fg-dim pt-6">
        Powered by {org?.name ?? "OpenFieldPro"}
      </footer>
    </div>
  );
}
