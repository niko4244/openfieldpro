import Link from "next/link";
import { formatMoney } from "@ofp/shared";
import { serverApi } from "@/lib/server-api";
import { customerWorkspaceCapabilities } from "@/lib/customer-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EditCustomerDialog } from "./edit-dialog";
import { CustomerEquipment } from "./customer-equipment";
import { CustomerServicePlans } from "./customer-service-plans";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: customerId } = await params;

  const [userResult, customerResult, jobsResult, timelineResult] = await Promise.allSettled([
    serverApi.me(),
    serverApi.customer(customerId),
    serverApi.jobs(),
    serverApi.activities({ customerId }),
  ]);

  const user = userResult.status === "fulfilled" ? userResult.value : null;
  if (!user) {
    return (
      <div>
        <PageHeader
          title="Customer record unavailable"
          description="Sign in again before viewing customer or equipment information."
        />
        <Card className="border-yellow/30 bg-yellow/5">
          <CardContent className="py-10 text-center">
            <p className="font-semibold text-fg">Your session is unavailable or has expired</p>
            <Link href="/login" className="mt-5 inline-flex">
              <Button>Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const capabilities = customerWorkspaceCapabilities(user.role);
  const isTechnician = user.role === "technician";
  const customer = customerResult.status === "fulfilled" ? customerResult.value : null;
  const allJobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
  const timeline = timelineResult.status === "fulfilled" ? timelineResult.value : [];
  const customerJobs = allJobs.filter((job) => job.customerId === customerId);

  if (!customer) {
    return (
      <div>
        <PageHeader
          title="Customer not found"
          description="The customer is unavailable or this session is not authorized to view it."
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-fg-muted">
            Return to the customer list and verify the assigned work order.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="customer-detail">
      <PageHeader
        title={customer.name}
        description={`${customer.email ?? "No email"} · ${customer.phone ?? "No phone"} · added ${new Date(customer.createdAt).toLocaleDateString()}`}
        actions={capabilities.editCustomer ? <EditCustomerDialog customer={customer} /> : undefined}
      />

      {isTechnician && (
        <Card className="mb-6 border-blue/20 bg-blue/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-fg">Assigned customer record</p>
            <p className="mt-1 text-xs text-fg-muted">
              Contact editing, service-plan enrollment, job pricing, and equipment deletion remain office-only. You may add equipment evidence needed for assigned work.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{isTechnician ? "Assigned jobs" : "Jobs"} ({customerJobs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {customerJobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">
                {isTechnician ? "No assigned jobs for this customer." : "No jobs for this customer."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {customerJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-200 px-3 py-3 no-underline transition-colors hover:bg-surface-400 hover:no-underline"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <JobStatusBadge status={job.status} />
                      <span className="truncate text-sm text-fg">{job.title}</span>
                    </div>
                    {capabilities.showJobFinancials ? (
                      <span className="shrink-0 text-sm text-fg-muted">{formatMoney(job.total)}</span>
                    ) : (
                      <span className="shrink-0 text-xs text-fg-dim">Open →</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">No activity yet.</p>
            ) : (
              <div className="relative space-y-4 border-l-2 border-surface-400 pl-4">
                {timeline.map((activity) => (
                  <div key={activity.id} className="relative">
                    <div className="absolute -left-[25px] top-1 h-3 w-3 rounded-full border-2 border-surface-300 bg-surface-500" />
                    <p className="text-sm text-fg">{activity.summary}</p>
                    <p className="mt-0.5 text-xs text-fg-dim">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`mt-6 grid grid-cols-1 gap-6 ${capabilities.manageServicePlans ? "lg:grid-cols-2" : ""}`}>
        {capabilities.manageServicePlans && <CustomerServicePlans customerId={customerId} />}
        <CustomerEquipment customerId={customerId} role={user.role} />
      </div>
    </div>
  );
}
