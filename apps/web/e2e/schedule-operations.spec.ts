import { expect, test, type Page, type Route } from "@playwright/test";

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function appointmentAt(hour: number) {
  const start = new Date();
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 1);
  return {
    id: "appointment-washer",
    jobId: "job-washer",
    technicianId: "tech-alex",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockScheduleApi(
  page: Page,
  options: { appointmentFailures?: number; jobsFail?: boolean; appointments?: ReturnType<typeof appointmentAt>[] } = {},
) {
  let appointmentRequests = 0;
  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/notifications/unread-count") return fulfillJson(route, { count: 0 });
    if (url.pathname === "/api/notifications") return fulfillJson(route, []);
    if (url.pathname === "/api/appointments") {
      appointmentRequests += 1;
      if (appointmentRequests <= (options.appointmentFailures ?? 0)) {
        return fulfillJson(route, { error: "schedule unavailable" }, 503);
      }
      return fulfillJson(route, options.appointments ?? [appointmentAt(9)]);
    }
    if (url.pathname === "/api/jobs") {
      if (options.jobsFail) return fulfillJson(route, { error: "jobs unavailable" }, 503);
      return fulfillJson(route, [{
        id: "job-washer",
        customerId: "customer-1",
        title: "Washer not draining",
        status: "scheduled",
        scheduledAt: appointmentAt(9).startsAt,
        assignedTo: "tech-alex",
        total: 14900,
        createdAt: appointmentAt(6).startsAt,
      }]);
    }
    return fulfillJson(route, {});
  });
}

test("schedule keeps view, date, and search in the URL with accessible controls", async ({ page }) => {
  await mockScheduleApi(page);
  const today = dateKey();
  await page.goto(`/schedule?view=day&date=${today}&q=Washer`);

  await expect(page.getByRole("tab", { name: "Day" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("searchbox", { name: "Search schedule" })).toHaveValue("Washer");
  await expect(page.getByText("Washer not draining")).toBeVisible();

  await page.getByRole("tab", { name: "Week" }).click();
  await expect(page).toHaveURL(new RegExp(`view=week.*date=${today}.*q=Washer`));
  await expect(page.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
});

test("schedule distinguishes an appointment outage from missing job details and retries", async ({ page }) => {
  await mockScheduleApi(page, { appointmentFailures: 1 });
  await page.goto("/schedule");

  await expect(page.getByText("Schedule could not be loaded.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Retry schedule" }).click();
  await expect(page.getByText("Washer not draining")).toBeVisible();

  const partialPage = await page.context().newPage();
  await mockScheduleApi(partialPage, { jobsFail: true });
  await partialPage.goto("/schedule");
  await expect(partialPage.getByRole("status")).toContainText("Job details are temporarily unavailable");
  await expect(partialPage.getByText("job-wash")).toBeVisible();
});

test("empty and mobile schedule states stay field-ready without horizontal overflow", async ({ page }) => {
  await mockScheduleApi(page, { appointments: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/schedule");

  await expect(page.getByText("No visits scheduled")).toBeVisible();
  await expect(page.getByRole("link", { name: "New job" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open dispatch" }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
