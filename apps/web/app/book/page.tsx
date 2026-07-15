"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

interface BookingForm {
  name: string;
  email: string;
  phone: string;
  service: string;
  preferredDate: string;
  preferredTime: string;
  notes: string;
  address: string;
}

const SERVICES = [
  "HVAC Repair",
  "AC Installation",
  "Furnace Maintenance",
  "Plumbing Repair",
  "Drain Cleaning",
  "Water Heater Service",
  "Electrical Repair",
  "Panel Upgrade",
  "General Service",
];

export default function BookPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<BookingForm>({
    name: "",
    email: "",
    phone: "",
    service: SERVICES[0],
    preferredDate: "",
    preferredTime: "",
    notes: "",
    address: "",
  });

  const update = (field: keyof BookingForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ponytail: booking form submits locally — no API endpoint yet.
    // Ceiling: single-org demo. Upgrade: POST /api/public/bookings with email/SMS confirmation.
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-xl font-bold text-fg mb-2">Booking Request Sent!</h2>
            <p className="text-sm text-fg-muted mb-6">
              Thanks, {form.name}! We&apos;ll review your request and reach out to confirm your
              appointment for <strong>{form.service}</strong>.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                setForm({
                  name: "",
                  email: "",
                  phone: "",
                  service: SERVICES[0],
                  preferredDate: "",
                  preferredTime: "",
                  notes: "",
                  address: "",
                });
              }}
              className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer border-none"
            >
              Book Another Service
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-surface-100">
      {/* Simple header for public booking */}
      <div className="bg-surface-200 border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-fg">Book a Service</h1>
          <p className="text-sm text-fg-muted mt-1">
            Fill out the form below and we&apos;ll get back to you within 24 hours.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Contact info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Full Name *
                  </label>
                  <Input
                    required
                    placeholder="John Smith"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Email *
                  </label>
                  <Input
                    required
                    type="email"
                    placeholder="john@example.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Phone *
                  </label>
                  <Input
                    required
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Service *
                  </label>
                  <select
                    required
                    value={form.service}
                    onChange={(e) => update("service", e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                  >
                    {SERVICES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Service Address *
                </label>
                <Input
                  required
                  placeholder="123 Main St, City, State"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>

              {/* Preferred date/time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Preferred Date
                  </label>
                  <Input
                    type="date"
                    min={today}
                    value={form.preferredDate}
                    onChange={(e) => update("preferredDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Preferred Time
                  </label>
                  <select
                    value={form.preferredTime}
                    onChange={(e) => update("preferredTime", e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                  >
                    <option value="">No preference</option>
                    <option value="morning">Morning (8am–12pm)</option>
                    <option value="afternoon">Afternoon (12pm–4pm)</option>
                    <option value="evening">Evening (4pm–7pm)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  placeholder="Describe your issue or any special requests..."
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="pt-2">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!form.name || !form.email || !form.phone || !form.address}
                >
                  Request Booking
                </Button>
                <p className="text-xs text-fg-dim text-center mt-3">
                  We&apos;ll contact you within 24 hours to confirm your appointment.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
