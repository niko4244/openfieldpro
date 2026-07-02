// Starter notification templates installed via POST /api/templates/defaults.
// Copy is plain paragraphs + merge fields; the branded HTML shell is applied
// at render time by wrapEmailHtml() so these stay readable in the editor.

import type { TemplateChannel, TemplateKey } from "@ofp/shared";

export interface DefaultTemplate {
  key: TemplateKey;
  channel: TemplateChannel;
  name: string;
  subject: string | null;
  body: string;
}

export const DEFAULT_TEMPLATES: ReadonlyArray<DefaultTemplate> = [
  {
    key: "invoice.created",
    channel: "email",
    name: "Invoice sent",
    subject: "Invoice {{invoice.number}} from {{org.name}}",
    body: `Hi {{customer.name}},

Thanks for choosing {{org.name}}. Your invoice for {{job.title}} is ready.

Invoice: {{invoice.number}}
Amount due: {{invoice.total}}
Due date: {{invoice.dueAt}}

You can pay by card, bank transfer, cash, or check. If you have any questions about this invoice, just reply to this email.

Thank you for your business!
{{org.name}}`,
  },
  {
    key: "invoice.due_soon",
    channel: "email",
    name: "Invoice due soon",
    subject: "Reminder: invoice {{invoice.number}} is due {{invoice.dueAt}}",
    body: `Hi {{customer.name}},

Just a friendly reminder that invoice {{invoice.number}} for {{invoice.total}} is due on {{invoice.dueAt}}.

If you've already sent payment, please disregard this note. Otherwise, you can pay by card, bank transfer, cash, or check.

Thanks!
{{org.name}}`,
  },
  {
    key: "invoice.overdue",
    channel: "email",
    name: "Invoice past due",
    subject: "Past due: invoice {{invoice.number}} ({{invoice.total}})",
    body: `Hi {{customer.name}},

Our records show invoice {{invoice.number}} for {{invoice.total}} was due on {{invoice.dueAt}} and is now past due.

If you've already sent payment, thank you — please disregard this note. Otherwise, we'd appreciate payment at your earliest convenience. Reply to this email if you'd like to discuss payment options.

Thank you,
{{org.name}}`,
  },
  {
    key: "invoice.paid",
    channel: "email",
    name: "Payment received",
    subject: "Payment received — invoice {{invoice.number}}",
    body: `Hi {{customer.name}},

We've received your payment of {{invoice.total}} for invoice {{invoice.number}}. This invoice is now paid in full.

Thank you for your business — we look forward to serving you again.

{{org.name}}`,
  },
  {
    key: "review.request",
    channel: "email",
    name: "Review request",
    subject: "How did we do, {{customer.name}}?",
    body: `Hi {{customer.name}},

Thanks again for choosing {{org.name}} for {{job.title}}. We hope everything went great!

If you have a minute, we'd really appreciate a quick review — it helps neighbors find us and helps our technicians know how they're doing.

Thank you!
{{org.name}}`,
  },
  {
    key: "job.scheduled",
    channel: "email",
    name: "Job scheduled confirmation",
    subject: "You're booked: {{job.title}} on {{job.scheduledAt}}",
    body: `Hi {{customer.name}},

You're all set! We've scheduled {{job.title}} for {{job.scheduledAt}}.

If you need to reschedule or have any questions before your appointment, just reply to this email or give us a call.

See you soon,
{{org.name}}`,
  },
  {
    key: "appointment.reminder.24h",
    channel: "sms",
    name: "24h reminder (text)",
    subject: null,
    body: "Hi {{customer.name}}, this is {{org.name}} — a reminder that your appointment for {{job.title}} is tomorrow at {{appointment.startsAt}}. Reply to reschedule.",
  },
  {
    key: "appointment.on_my_way",
    channel: "sms",
    name: "On my way (text)",
    subject: null,
    body: "{{org.name}}: your technician is on the way for {{job.title}}. See you soon!",
  },
];
