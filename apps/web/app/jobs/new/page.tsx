import { api } from "../../../lib/api";
import { JobCreateForm } from "../../../components/WorkflowForms";

export default async function NewJobPage({ searchParams }: { searchParams?: Promise<{ customerId?: string }> }) {
  const query = searchParams ? await searchParams : {};
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let error: string | null = null;
  try {
    customers = await api.customers();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">New job</p>
          <h1>Create the work order while the details are fresh.</h1>
          <p className="muted">Capture customer, scope, estimate value, and labor cost before scheduling.</p>
        </div>
        <div className="command-panel">
          <span className="table-label">Workflow</span>
          <p className="muted">Customer → Job → Schedule → Invoice → Payment</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header"><div><h2>Job details</h2><p className="muted">This creates a lead job by default.</p></div></div>
        {error ? <p className="notice error">API unreachable ({error}).</p> : <JobCreateForm customers={customers} />}
        {query?.customerId && <p className="fine-print">Opened from customer {query.customerId.slice(0, 8)}. Select that customer in the form before submitting.</p>}
      </section>
    </div>
  );
}
