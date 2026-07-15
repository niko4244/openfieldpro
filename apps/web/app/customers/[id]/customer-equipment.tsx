"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface EquipmentDTO {
  id: string; orgId: string; customerId: string; type: string;
  make?: string | null; model?: string | null; serialNumber?: string | null;
  installDate?: string | null; warrantyExpiry?: string | null;
  notes?: string | null; createdAt: string;
}
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface EquipmentForm {
  type: string;
  make: string;
  model: string;
  serialNumber: string;
  installDate: string;
  warrantyExpiry: string;
  notes: string;
}

const EQUIPMENT_TYPES = ["furnace", "ac_unit", "water_heater", "heat_pump", "boiler", "other"];

const TYPE_LABELS: Record<string, string> = {
  furnace: "Furnace",
  ac_unit: "AC Unit",
  water_heater: "Water Heater",
  heat_pump: "Heat Pump",
  boiler: "Boiler",
  other: "Other",
};

const initForm: EquipmentForm = {
  type: "furnace",
  make: "",
  model: "",
  serialNumber: "",
  installDate: "",
  warrantyExpiry: "",
  notes: "",
};

export function CustomerEquipment({ customerId }: { customerId: string }) {
  const [equipment, setEquipment] = useState<EquipmentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EquipmentForm>(initForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.equipment({ customerId });
      setEquipment(list);
    } catch {
      setError("Failed to load equipment");
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createEquipment({
        customerId,
        type: form.type,
        make: form.make || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        installDate: form.installDate || undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        notes: form.notes || undefined,
      });
      setAddOpen(false);
      setForm(initForm);
      await load();
    } catch {
      setError("Failed to add equipment");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEquipment(id);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silent */ }
    setDeleting(null);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Equipment</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>Add Equipment</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red py-4">{error}</p>
        ) : equipment.length === 0 ? (
          <p className="text-sm text-fg-muted py-6 text-center">
            No equipment tracked for this customer.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {equipment.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted bg-surface-300 px-1.5 py-0.5 rounded">
                      {TYPE_LABELS[e.type] ?? e.type}
                    </span>
                    {(e.make || e.model) && (
                      <span className="text-sm text-fg truncate">
                        {[e.make, e.model].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {e.serialNumber && (
                      <span className="text-xs text-fg-dim font-mono">SN: {e.serialNumber}</span>
                    )}
                    {e.installDate && (
                      <span className="text-xs text-fg-dim">
                        Installed: {new Date(e.installDate).toLocaleDateString()}
                      </span>
                    )}
                    {e.warrantyExpiry && (
                      <span className="text-xs text-fg-dim">
                        Warranty: {new Date(e.warrantyExpiry).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {deleting === e.id ? (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-xs text-red hover:text-red/80 transition-colors cursor-pointer bg-transparent border-none"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleting(null)}
                      className="text-xs text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleting(e.id)}
                    className="text-xs text-fg-muted hover:text-red transition-colors cursor-pointer bg-transparent border-none shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Equipment Dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { if (!submitting) { setAddOpen(false); setForm(initForm); } }}>
          <div className="bg-surface-200 rounded-xl border border-border w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-fg mb-4">Add Equipment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Make</label>
                  <Input placeholder="Carrier" value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Model</label>
                  <Input placeholder="GSX14" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">Serial Number</label>
                <Input placeholder="SN-12345" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Install Date</label>
                  <Input type="date" value={form.installDate} onChange={(e) => setForm((f) => ({ ...f, installDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Warranty Expiry</label>
                  <Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">Notes</label>
                <textarea
                  placeholder="Warranty info, maintenance notes..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 resize-none"
                />
              </div>
              {error && <p className="text-xs text-red">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setAddOpen(false); setForm(initForm); }} disabled={submitting}>Cancel</Button>
                <Button onClick={handleAdd} disabled={submitting}>
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ponytail: Equipment types are hardcoded. Ceiling: types are not configurable per org.
// Upgrade: add equipment_types table with org-scoped config.
