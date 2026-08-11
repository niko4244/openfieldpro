import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge } from "@/components/status-badge";
import { EditCustomerDialog } from "./edit-dialog";
import { CustomerEquipment } from "./customer-equipment";
import { CustomerServicePlans } from "./customer-service-plans";
import { CustomerPortalLinks } from "./customer-portal-links";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: customerId } = await params;

  let customer: Awaited<ReturnType<typeof api.customer>> | null = null;
  let customerLoadFailed = false;
  try {
    customer = await api.customer(customerId);
  } catch {
    customerLoadFailed = true;
  }

  const [allJobs, timeline] = await Promise.all([
    api.jobs().catch(() => []),
    api.activities({ customerId }).catch(() => []),
  ]);
  const customerJobs = allJobs.filter((j) => j.customerId === customerId);

  return (
    <div>
      {customerLoadFailed ? (
        <PageHeader
          title="Customer (couldn't load)"
          description={`ID: ${customerId}`}
        />
      ) : customer ? (
        <PageHeader
          title={customer.name}
          description={`${customer.email ?? "—"} · ${customer.phone ?? "—"} · added ${new Date(customer.createdAt).toLocaleDateString()}`}
          actions={<EditCustomerDialog customer={customer} />}
        />
      ) : (
        <PageHeader title="Customer not found" description={`No customer with id ${customerId} in this org.`} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Jobs ({customerJobs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {customerJobs.length === 0 ? (
              <p className="text-sm text-fg-muted py-6 text-center">No jobs for this customer.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {customerJobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-200 hover:bg-surface-400 transition-colors no-underline hover:no-underline"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <JobStatusBadge status={j.status} />
                      <span className="text-sm text-fg truncate">{j.title}</span>
                    </div>
                    <span className="text-sm text-fg-muted shrink-0">
                      {formatMoney(j.total)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-fg-muted py-6 text-center">No activity yet.</p>
            ) : (
              <div className="relative pl-4 border-l-2 border-surface-400 space-y-4">
                {timeline.map((a) => (
                  <div key={a.id} className="relative">
                    <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-surface-500 border-2 border-surface-300" />
                    <p className="text-sm text-fg">{a.summary}</p>
                    <p className="text-xs text-fg-dim mt-0.5">
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomerServicePlans customerId={customerId} />
        <CustomerEquipment customerId={customerId} />
      </div>

      <div className="mt-6">
        <CustomerPortalLinks customerId={customerId} />
      </div>
    </div>
  );
}
