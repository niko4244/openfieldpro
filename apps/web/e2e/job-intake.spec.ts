import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function mockIntakeApi(
  page: Page,
  capture: {
    customer?: Record<string, unknown>;
    job?: Record<string, unknown>;
    appointment?: Record<string, unknown>;
  },
) {
  const customers = [
    {
      id: "customer-1",
      name: "Taylor Morgan",
      email: "taylor@example.test",
      phone: "515-555-0101",
      createdAt: "2026-07-11T12:00:00.000Z",
    },
    {
      id: "customer-2",
      name: "Jordan Lee",
      email: "jordan@example.test",
      phone: "515-555-0102",
      createdAt: "2026-07-11T12:00:00.000Z",
    },
  ];
  const users = [
    {
      id: "owner-1",
      orgId: "org-1",
      email: "owner@example.test",
      name: "Morgan Owner",
      role: "owner",
      active: true,
      createdAt: "2026-07-11T12:00:00.000Z",
    },
    {
      id: "tech-1",
      orgId: "org-1",
      email: "alex@example.test",
      name: "Alex Rivera",
      role: "technician",
      active: true,
      createdAt: "2026-07-11T12:00:00.000Z",
    },
  ];

  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/notifications/unread-count") return fulfillJson(route, { count: 0 });
    if (pathname === "/api/notifications") return fulfillJson(route, []);
    if (pathname === "/api/customers" && request.method() === "GET") return fulfillJson(route, customers);
    if (pathname === "/api/users" && request.method() === "GET") return fulfillJson(route, users);

    if (pathname === "/api/customers" && request.method() === "POST") {
      capture.customer = request.postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, {
        id: "customer-created",
        ...capture.customer,
        createdAt: "2026-07-11T12:00:00.000Z",
      }, 201);
    }

    if (pathname === "/api/jobs" && request.method() === "POST") {
      capture.job = request.postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, {
        id: "job-created",
        total: 0,
        createdAt: "2026-07-11T12:00:00.000Z",
        ...capture.job,
      }, 201);
    }

    if (pathname === "/api/appointments" && request.method() === "POST") {
      capture.appointment = request.postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, {
        id: "appointment-created",
        ...capture.appointment,
      }, 201);
    }

    return fulfillJson(route, {});
  });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("dispatcher creates and schedules a job for an existing customer", async ({ page }) => {
  const capture: {
    customer?: Record<string, unknown>;
    job?: Record<string, unknown>;
    appointment?: Record<string, unknown>;
  } = {};
  const runtimeErrors = collectRuntimeErrors(page);
  await mockIntakeApi(page, capture);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jobs/new");

  await expect(page).toHaveTitle(/OpenFieldPro/i);
  await expect(page.getByRole("heading", { name: "New job" })).toBeVisible();
  await expect(page.getByText("Create the work order, customer record, and appointment in one intake flow.")).toBeVisible();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("customer-1");
  await expect(page.getByRole("link", { name: "New Job" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Jobs", exact: true })).not.toHaveAttribute("aria-current", "page");

  await page.getByLabel("Job title").fill("Refrigerator not cooling");
  await page.getByLabel("Customer complaint and access notes").fill("Fresh-food section is warm. Call before arrival; dog will be secured.");
  await page.getByLabel("Visit length").selectOption("120");
  await page.getByLabel("Technician").selectOption("tech-1");

  await page.screenshot({ path: path.join(artifactDir, "new-job-scheduled-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Create and schedule job" }).click();
  await expect.poll(() => capture.job).toBeTruthy();
  await expect.poll(() => capture.appointment).toBeTruthy();

  expect(capture.customer).toBeUndefined();
  expect(capture.job).toMatchObject({
    customerId: "customer-1",
    title: "Refrigerator not cooling",
    status: "lead",
  });
  expect(capture.job).not.toHaveProperty("scheduledAt");
  expect(capture.appointment).toMatchObject({
    jobId: "job-created",
    technicianId: "tech-1",
  });
  expect(new Date(String(capture.appointment?.endsAt)).getTime() - new Date(String(capture.appointment?.startsAt)).getTime()).toBe(120 * 60_000);
  expect(runtimeErrors).toEqual([]);
});

test("mobile intake creates a new customer and clearly supports unscheduled leads", async ({ page }) => {
  const capture: {
    customer?: Record<string, unknown>;
    job?: Record<string, unknown>;
    appointment?: Record<string, unknown>;
  } = {};
  const runtimeErrors = collectRuntimeErrors(page);
  await mockIntakeApi(page, capture);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs/new");

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("link", { name: "New Job" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Jobs", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Close navigation menu" }).click();

  await page.getByRole("button", { name: "new customer" }).click();
  await page.getByLabel("Customer name").fill("Casey Nguyen");
  await page.getByLabel("Phone").fill("515-555-0199");
  await page.getByLabel("Email").fill("casey@example.test");
  await page.getByLabel("Job title").fill("Dryer squealing");
  await page.getByRole("switch", { name: "Schedule this job" }).click();

  await expect(page.getByText("The job will enter the pipeline as an unscheduled lead and can be dispatched later.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create unscheduled job" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: path.join(artifactDir, "new-job-unscheduled-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Create unscheduled job" }).click();
  await expect.poll(() => capture.customer).toBeTruthy();
  await expect.poll(() => capture.job).toBeTruthy();

  expect(capture.customer).toEqual({
    name: "Casey Nguyen",
    email: "casey@example.test",
    phone: "515-555-0199",
  });
  expect(capture.job).toMatchObject({
    customerId: "customer-created",
    title: "Dryer squealing",
    status: "lead",
  });
  expect(capture.appointment).toBeUndefined();
  expect(runtimeErrors).toEqual([]);
});
