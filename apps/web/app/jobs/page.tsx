import type { CustomerDTO, JobDTO } from "@ofp/shared";
import { serverApi } from "@/lib/server-api";
import { JobsList, type JobListItem } from "./jobs-list";

function resultError(result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") return null;
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

export default async function JobsPage() {
  const [userResult, jobsResult, customersResult] = await Promise.allSettled([
    serverApi.currentUser(),
    serverApi.jobs(),
    serverApi.customers(),
  ]);

  const user = userResult.status === "fulfilled" ? userResult.value : null;
  const role = user?.role ?? null;
  const jobs: JobDTO[] = jobsResult.status === "fulfilled" ? jobsResult.value : [];
  const customers: CustomerDTO[] =
    customersResult.status === "fulfilled" ? customersResult.value : [];

  const safeJobs: JobListItem[] = jobs.map((job) => ({
    id: job.id,
    customerId: job.customerId,
    title: job.title,
    description: job.description,
    status: job.status,
    scheduledAt: job.scheduledAt,
    createdAt: job.createdAt,
    ...(role === "owner" || role === "dispatcher" ? { total: job.total } : {}),
    ...(role === "technician" ? { financialsRestricted: true } : {}),
  }));

  const error =
    resultError(userResult) ?? resultError(jobsResult) ?? resultError(customersResult);

  return (
    <JobsList
      jobs={safeJobs}
      customers={customers}
      role={role}
      error={error}
    />
  );
}
