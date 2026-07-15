import { api } from "@/lib/api";
import { estimateDocumentHtml } from "@/lib/document-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [estimate, jobs, customers, org] = await Promise.all([
    api.estimate(id).catch(() => null),
    api.jobs().catch(() => []),
    api.customers().catch(() => []),
    api.org().catch(() => null),
  ]);

  if (!estimate) {
    return Response.json({ error: "estimate not found" }, { status: 404 });
  }

  const job = jobs.find((row) => row.id === estimate.jobId) ?? null;
  const customer = job ? customers.find((row) => row.id === job.customerId) ?? null : null;
  const html = estimateDocumentHtml({ estimate, customer, job, lineItems: estimate.lineItems, org });
  const estimateNumber = estimate.number;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${estimateNumber}.html"`,
    },
  });
}
