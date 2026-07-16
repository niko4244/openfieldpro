import Link from "next/link";
import { api } from "@/lib/api";
import { invoiceDocumentHtml } from "@/lib/document-data";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocumentPreviewWorkbench } from "@/components/document-preview-workbench";

export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, jobs, customers, org] = await Promise.all([
    api.invoice(id).catch(() => null),
    api.jobs().catch(() => []),
    api.customers().catch(() => []),
    api.org().catch(() => null),
  ]);

  if (!invoice) {
    return (
      <div>
        <PageHeader title="Invoice preview unavailable" description={`Invoice ID: ${id}`} />
        <Card>
          <EmptyState title="No invoice data" description="Verify the invoice ID or check your API connection." />
        </Card>
      </div>
    );
  }

  const job = jobs.find((row) => row.id === invoice.jobId) ?? null;
  const customer = job ? customers.find((row) => row.id === job.customerId) ?? null : null;
  const html = invoiceDocumentHtml({ invoice, customer, job, lineItems: invoice.lineItems, org });

  return (
    <div>
      <PageHeader
        title={`Preview ${invoice.number}`}
        description="Customer-facing invoice/receipt document preview."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/invoices/${invoice.id}/document.html`} target="_blank">
              <Button size="sm" variant="secondary">Open customer view</Button>
            </Link>
            <Link href={`/invoices/${invoice.id}`}>
              <Button size="sm" variant="secondary">Back to invoice</Button>
            </Link>
          </div>
        }
      />
      <DocumentPreviewWorkbench
        documents={[{ id: "invoice", label: "Invoice", html }]}
        fileName={`${invoice.number}.html`}
      />
    </div>
  );
}
