"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatMoney } from "@ofp/shared";
import { api, type EstimateOption } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type EstimateDetail = Awaited<ReturnType<typeof api.estimate>>;

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [estimate, setEstimate] = useState<EstimateDetail | null>(null);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await api.estimate(id);
      setEstimate(value);
      setActiveId((current) => current || value.options[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load estimate");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const active = estimate?.options.find((option) => option.id === activeId) ?? estimate?.options[0];
  const editable = estimate?.status === "draft" || estimate?.status === "sent";

  async function refreshAfter(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The estimate could not be updated");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="grid gap-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (!estimate) return <Card><div className="grid justify-items-center gap-3 py-10"><p className="text-sm text-red">{error ?? "Estimate not found"}</p><Button onClick={() => void load()}>Retry</Button></div></Card>;

  return (
    <div>
      <PageHeader
        title={estimate.number}
        description={`${estimate.status} · ${estimate.options.length} options`}
        actions={<div className="flex flex-wrap gap-2">
          <Link href={`/estimates/${id}/preview`}><Button size="sm" variant="secondary">Preview</Button></Link>
          {estimate.status === "draft" ? <Button size="sm" disabled={busy} onClick={() => refreshAfter(() => api.markEstimateSent(id))}>Mark sent</Button> : null}
          {estimate.status === "approved" ? <Button size="sm" disabled={busy || Boolean(estimate.copiedToJobAt)} onClick={() => refreshAfter(() => api.copyApprovedEstimateToJob(id))}>{estimate.copiedToJobAt ? "Copied to job" : "Copy approved work to job"}</Button> : null}
        </div>}
      />
      {error ? <Card className="mb-4 border-red/30 bg-red/5"><p className="text-sm text-red">{error}</p></Card> : null}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Estimate options">
        {estimate.options.map((option) => (
          <button key={option.id} role="tab" aria-selected={active?.id === option.id} onClick={() => setActiveId(option.id)} className={`rounded-xl border p-4 text-left ${active?.id === option.id ? "border-accent bg-accent/10" : "border-border bg-surface-100"}`}>
            <span className="block text-sm font-semibold text-fg">{option.label}</span>
            <span className="mt-1 block text-lg font-black text-fg">{formatMoney(option.total)}</span>
          </button>
        ))}
      </div>
      {active ? <OptionEditor estimateId={id} option={active} editable={editable} busy={busy} onChange={refreshAfter} /> : <Card><p className="py-10 text-center text-sm text-fg-muted">This estimate has no options.</p></Card>}
      {active && editable ? (
        <Card className="mt-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_90px_130px_auto] sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            const unitPrice = Math.round(Number(price) * 100);
            void refreshAfter(() => api.addEstimateOptionLine(id, active.id, { description, quantity: Number(quantity), unitPrice })).then(() => { setDescription(""); setQuantity("1"); setPrice(""); });
          }}>
            <label className="text-xs text-fg-muted">Service or material<Input required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label className="text-xs text-fg-muted">Quantity<Input required min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <label className="text-xs text-fg-muted">Unit price<Input required min="0" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <Button type="submit" disabled={busy}>Add line</Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function OptionEditor({ estimateId, option, editable, busy, onChange }: { estimateId: string; option: EstimateOption; editable: boolean; busy: boolean; onChange: (action: () => Promise<unknown>) => Promise<void> }) {
  return <Card>
    <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-fg">{option.label}</h2><strong>{formatMoney(option.total)}</strong></div>
    {option.lineItems.length === 0 ? <p className="py-8 text-center text-sm text-fg-muted">No services or materials in this option.</p> : <div className="grid gap-2">{option.lineItems.map((line) => (
      <div key={line.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-surface-200 p-3">
        <div><p className="text-sm text-fg">{line.description}</p><p className="text-xs text-fg-muted">{line.quantity} × {formatMoney(line.unitPrice)} = {formatMoney(line.quantity * line.unitPrice)}</p></div>
        {editable ? <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => {
            const description = window.prompt("Service or material", line.description)?.trim();
            if (!description) return;
            const quantity = Number(window.prompt("Quantity", String(line.quantity)));
            const unitPrice = Math.round(Number(window.prompt("Unit price in dollars", String(line.unitPrice / 100))) * 100);
            if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(unitPrice) || unitPrice < 0) return;
            void onChange(() => api.patchEstimateOptionLine(estimateId, option.id, line.id, { description, quantity, unitPrice }));
          }}>Edit</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => onChange(() => api.deleteEstimateOptionLine(estimateId, option.id, line.id))}>Remove</Button>
        </div> : null}
      </div>
    ))}</div>}
  </Card>;
}
