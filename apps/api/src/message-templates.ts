// Outbound customer message rendering. Templates use Mustache syntax:
// {{variable}} substitution and {{#name}}…{{/name}} sections that render only
// when the variable is a non-empty value. Unknown variables render empty.
//
// Emails are plain text (not HTML), so Mustache's HTML escaping is disabled —
// otherwise URLs in variables like the portal link would be mangled.
import Mustache from "mustache";
import type { MessageSettings } from "@ofp/shared";

Mustache.escape = (value: string) => value;

export type TemplateVariables = Record<string, string | number | null | undefined>;

export function renderMessageTemplate(template: string, variables: TemplateVariables): string {
  return Mustache.render(template, variables);
}

export interface MessageRenderResult {
  subject: string;
  body: string;
  variables: TemplateVariables;
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Builds the subject/body for an invoice email from the org's message
 * template settings. `balanceCents` drives the balance variable so operators
 * always email the current amount owed. Unknown variables render empty.
 */
export function renderInvoiceMessage(
  messages: MessageSettings,
  data: {
    companyName: string;
    customerName: string;
    invoiceNumber: string;
    totalCents: number;
    balanceCents: number;
    dueDate?: Date | string | null;
    formattedMoney?: (cents: number) => string;
  },
): MessageRenderResult {
  const money = data.formattedMoney ?? ((cents: number) => `${(cents / 100).toFixed(2)}`);
  const variables: TemplateVariables = {
    companyName: data.companyName,
    customerName: data.customerName,
    invoiceNumber: data.invoiceNumber,
    invoiceTotal: money(data.totalCents),
    balance: money(data.balanceCents),
    dueDate: formatDate(data.dueDate),
  };
  return {
    subject: renderMessageTemplate(messages.invoiceEmailSubject, variables),
    body: renderMessageTemplate(messages.invoiceEmailBody, variables),
    variables,
  };
}

/**
 * Builds the subject/body for an estimate email. `expiresAt` renders only
 * inside a {{#expiresAt}}…{{/expiresAt}} section, so estimates without an
 * expiry never leak a placeholder date.
 */
export function renderEstimateMessage(
  messages: MessageSettings,
  data: {
    companyName: string;
    customerName: string;
    estimateNumber: string;
    totalCents: number;
    optionCount: number;
    optionLabels?: string[];
    expiresAt?: Date | string | null;
    formattedMoney?: (cents: number) => string;
  },
): MessageRenderResult {
  const money = data.formattedMoney ?? ((cents: number) => `${(cents / 100).toFixed(2)}`);
  const variables: TemplateVariables = {
    companyName: data.companyName,
    customerName: data.customerName,
    estimateNumber: data.estimateNumber,
    estimateTotal: money(data.totalCents),
    optionCount: data.optionCount,
    optionLabels: data.optionLabels?.length ? data.optionLabels.join(", ") : null,
    expiresAt: formatDate(data.expiresAt),
  };
  return {
    subject: renderMessageTemplate(messages.estimateEmailSubject, variables),
    body: renderMessageTemplate(messages.estimateEmailBody, variables),
    variables,
  };
}
