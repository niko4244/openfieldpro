export interface CheckoutSessionLike {
  id?: string | null;
  payment_intent?: string | { id?: string | null } | null;
  metadata?: { invoiceId?: string; orgId?: string } | null;
  amount_total?: number | null;
}

export function paymentIdFromCheckoutSession(session: CheckoutSessionLike) {
  if (typeof session.payment_intent === "string" && session.payment_intent.trim()) return session.payment_intent;
  if (typeof session.payment_intent === "object" && session.payment_intent?.id) return session.payment_intent.id;
  return session.id?.trim() || null;
}

export function checkoutSessionPaymentCommand(eventId: string, session: CheckoutSessionLike) {
  const invoiceId = session.metadata?.invoiceId;
  const orgId = session.metadata?.orgId;
  const amount = session.amount_total ?? 0;
  const providerPaymentId = paymentIdFromCheckoutSession(session);
  return {
    invoiceId,
    orgId,
    amount,
    method: "card" as const,
    reference: session.id ?? providerPaymentId ?? undefined,
    provider: "stripe",
    providerPaymentId: providerPaymentId ?? undefined,
    idempotencyKey: eventId,
  };
}

export function validateCheckoutSessionCommand(command: ReturnType<typeof checkoutSessionPaymentCommand>) {
  if (!command.invoiceId) return "missing invoiceId metadata";
  if (!command.orgId) return "missing orgId metadata";
  if (!command.amount || command.amount <= 0) return "missing amount_total";
  if (!command.providerPaymentId) return "missing Stripe payment identity";
  return null;
}
