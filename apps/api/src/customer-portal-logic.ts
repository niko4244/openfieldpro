export interface PortalInvoiceInput {
  id: string;
  jobId: string;
  number: string;
  status: string;
  total: number;
  dueAt?: Date | string | null;
  createdAt?: Date | string | null;
  publicToken?: string | null;
}

export interface PortalPaymentInput {
  invoiceId: string;
  amount: number;
}

export function paidByInvoice(payments: PortalPaymentInput[]) {
  const paid = new Map<string, number>();
  for (const payment of payments) paid.set(payment.invoiceId, (paid.get(payment.invoiceId) ?? 0) + payment.amount);
  return paid;
}

export function decoratePortalInvoices(invoices: PortalInvoiceInput[], payments: PortalPaymentInput[], publicBaseUrl = "") {
  const paid = paidByInvoice(payments);
  return invoices.map((invoice) => {
    const amountPaid = paid.get(invoice.id) ?? 0;
    const balance = Math.max(invoice.total - amountPaid, 0);
    return {
      ...invoice,
      paid: amountPaid,
      balance,
      status: balance <= 0 ? "paid" : invoice.status,
      publicUrl: invoice.publicToken && publicBaseUrl ? `${publicBaseUrl}/public/invoices/${invoice.publicToken}` : null,
    };
  });
}

export function portalTotals(invoices: Array<{ total: number; paid: number; balance: number }>) {
  return invoices.reduce(
    (acc, invoice) => ({
      totalBilled: acc.totalBilled + invoice.total,
      totalPaid: acc.totalPaid + invoice.paid,
      totalBalance: acc.totalBalance + invoice.balance,
    }),
    { totalBilled: 0, totalPaid: 0, totalBalance: 0 },
  );
}
