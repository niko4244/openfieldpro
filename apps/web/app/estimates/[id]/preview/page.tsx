import Link from "next/link";
import { api } from "@/lib/api";
import { estimateDocumentHtml } from "@/lib/document-data";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocumentPreviewWorkbench } from "@/components/document-preview-workbench";

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
  const variants = estimate.status === "approved" ? undefined : estimate.options.map((option) => ({
    id: option.id,
    label: option.label,
    html: estimateDocumentHtml({
      estimate: { ...estimate, selectedOptionId: option.id },
      customer,
      job,
      lineItems: estimate.lineItems,
      org,
    }),
  }));

  return (
    <div>
      <PageHeader
        title={`Preview ${estimateNumber}`}
        description="Customer-facing estimate document preview."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/estimates/${estimate.id}/document.html`} target="_blank">
              <Button size="sm" variant="secondary">Open customer view</Button>
            </Link>
            {job && (
              <Link href={`/jobs/${job.id}`}>
                <Button size="sm" variant="secondary">Back to job</Button>
              </Link>
            )}
          </div>
        }
      />
      <DocumentPreviewWorkbench
        documents={[{ id: "estimate", label: "Estimate", html, variants }]}
        fileName={`${estimateNumber}.html`}
      />
    </div>
  );
}
