"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";

interface Props {
  customer: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  };
}

export function EditCustomerDialog({ customer }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patchCustomer(customer.id, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      window.location.reload();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ponytail: page reload after save is the simplest way to sync server-side
  // rendered data. Ceiling: flashes on save, loses scroll position. Upgrade:
  // convert customer detail to a client component or use a mutation + SWR.

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setError(null); } else setOpen(o); }}>
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Name *</label>
              <input
                className="h-10 px-3 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Email</label>
              <input
                className="h-10 px-3 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Phone</label>
              <input
                className="h-10 px-3 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Notes</label>
              <textarea
                className="min-h-[80px] px-3 py-2 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-red">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!name.trim() || saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
