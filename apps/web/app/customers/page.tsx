import { api } from "../../lib/api";
import Link from "next/link";
import { CustomerCreateForm } from "../../components/WorkflowForms";

export default async function CustomersPage() {
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
          <p className="eyebrow">Customer CRM</p>
          <h1>Every property, note, and job starts here.</h1>
          <p className="muted">Create the customer, keep the record clean, then run jobs, invoices, and activity from one hub.</p>
        </div>
        <div className="command-panel">
          <span className="table-label">Fast entry</span>
          <a className="button primary full" href="/jobs/new">Create customer + job</a>
          <a className="button full" href="/schedule">Schedule work</a>
        </div>
      </section>

      <section className="split-grid">
        <div className="section-card">
          <div className="section-header">
            <div>
              <h2>Customers</h2>
              <p className="muted">Quick scan of names, contact details, and service history entry points.</p>
            </div>
          </div>
          {error ? (
            <p className="notice error">API unreachable ({error}).</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td><strong>{customer.name}</strong></td>
                      <td>{customer.email ?? "—"}</td>
                      <td>{customer.phone ?? "—"}</td>
                      <td><Link href={`/customers/${customer.id}`} className="button compact">Open hub</Link></td>
                    </tr>
                  ))}
                  {customers.length === 0 && (
                    <tr><td colSpan={4}>No customers yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="section-card">
          <div className="section-header">
            <div>
              <h2>Add customer</h2>
              <p className="muted">Start the workflow before the phone call ends.</p>
            </div>
          </div>
          <CustomerCreateForm />
        </aside>
      </section>
    </div>
  );
}
