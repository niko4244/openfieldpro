import { api } from "../../lib/api";
import Link from "next/link";

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
          <p className="muted">Keep the customer record clean enough for dispatch, billing, and future service history.</p>
        </div>
        <div className="hero-summary">
          <span className="table-label">Total customers</span>
          <strong>{customers.length}</strong>
          <p className="muted">Org-scoped customer records loaded from the API.</p>
        </div>
      </section>

      <section className="section-card">
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
                    <td>
                      <Link href={`/customers/${customer.id}`} className="button compact">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={4}>No customers yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
