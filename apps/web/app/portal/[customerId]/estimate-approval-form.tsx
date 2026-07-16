"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@ofp/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EstimateApprovalForm({
  estimateId,
  options,
  customerName,
  signatureRequired,
}: {
  estimateId: string;
  options: Array<{ id: string; label: string; total: number }>;
  customerName?: string;
  signatureRequired: boolean;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const [signatureName, setSignatureName] = useState(customerName ?? "");
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (decision) return <p className="text-xs font-semibold text-green">Estimate {decision}. The service company has been notified.</p>;

  return (
    <form className="grid min-w-64 gap-3" onSubmit={(event) => {
      event.preventDefault();
      setError(null);
      startTransition(async () => {
        try {
          await api.approveEstimateOption(estimateId, { optionId: selectedId, signatureName: signatureName || undefined });
          setDecision("approved");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not approve estimate");
        }
      });
    }}>
      <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold text-fg-muted">Select one option</legend>{options.map((option) => (
        <label key={option.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-surface-100 p-3 text-sm">
          <span><input type="radio" name={`option-${estimateId}`} value={option.id} checked={selectedId === option.id} onChange={() => setSelectedId(option.id)} className="mr-2" />{option.label}</span>
          <strong>{formatMoney(option.total)}</strong>
        </label>
      ))}</fieldset>
      {signatureRequired ? <label className="text-xs font-semibold text-fg-muted">Type your name to sign<Input required value={signatureName} onChange={(event) => setSignatureName(event.target.value)} /></label> : null}
      {error ? <p role="alert" className="text-xs text-red">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || !selectedId || (signatureRequired && !signatureName.trim())}>{pending ? "Submitting..." : "Approve selected option"}</Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => {
          setError(null);
          startTransition(async () => {
            try { await api.declineEstimate(estimateId); setDecision("declined"); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Could not decline estimate"); }
          });
        }}>Decline estimate</Button>
      </div>
    </form>
  );
}
