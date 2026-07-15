import Link from "next/link";
import { api } from "@/lib/api";
import { estimateDocumentHtml } from "@/lib/document-data";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocumentActions } from "@/app/documents/document-actions";

export default async function EstimatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [estimate, jobs, customers, org] = await Promise.all([
    api.estimate(id).catch(() => null),
    api.jobs().catch(() => []),
    api.customers().catch(() => []),
    api.org().catch(() => null),
  ]);

  if (!estimate) {
    return (
      <div>
        <PageHeader title="Estimate preview unavailable" description={`Estimate ID: ${id}`} />
        <Card>
          <EmptyState title="No estimate data" description="Verify the estimate ID or check your API connection." />
        </Card>
      </div>
    );
  }

  const job = jobs.find((row) => row.id === estimate.jobId) ?? null;
  const customer = job ? customers.find((row) => row.id === job.customerId) ?? null : null;
  const html = estimateDocumentHtml({ estimate, customer, job, lineItems: estimate.lineItems, org });
  const estimateNumber = estimate.number;

  return (
    <div>
      <PageHeader
        title={`Preview ${estimateNumber}`}
        description="Customer-facing estimate document preview."
        actions={
          <div className="flex flex-wrap gap-2">
            <DocumentActions html={html} fileName={`${estimateNumber}.html`} />
            <Link href={`/estimates/${estimate.id}/document.html`} target="_blank">
              <Button size="sm" variant="secondary">Open HTML</Button>
            </Link>
            {job && (
              <Link href={`/jobs/${job.id}`}>
                <Button size="sm" variant="secondary">Back to job</Button>
              </Link>
            )}
          </div>
        }
      />
      <Card className="mb-5 border-accent/30 bg-accent/5">
        <p className="text-sm text-fg-muted">
          This estimate preview uses real estimate, job, customer, line-item, and organization-branding data. A later PDF/email workflow can reuse the same shared renderer.
        </p>
      </Card>
      <iframe
        title={`Estimate preview ${estimateNumber}`}
        srcDoc={html}
        className="h-[980px] w-full rounded-2xl border border-border bg-white"
      />
    </div>
  );
}
