import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "technician";
}

const owner: SessionUser = {
  id: "owner-1",
  name: "Morgan Owner",
  email: "owner@example.test",
  role: "owner",
};

const technician: SessionUser = {
  id: "tech-1",
  name: "Alex Rivera",
  email: "alex@example.test",
  role: "technician",
};

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

function sessionCookieValue(user: SessionUser) {
  return user.role === "technician" ? "technician-session" : "owner-session";
}

async function mockSessionApi(page: Page, sessionUser: SessionUser = owner) {
  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/login" && request.method() === "POST") {
      return fulfillJson(
        route,
        { token: sessionCookieValue(sessionUser), user: sessionUser, orgId: "org-1" },
        200,
        {
          "set-cookie": `ofp_session=${sessionCookieValue(sessionUser)}; Path=/; HttpOnly; SameSite=Lax`,
        },
      );
    }
    if (pathname === "/api/auth/logout" && request.method() === "POST") {
      return fulfillJson(route, { ok: true }, 200, {
        "set-cookie": "ofp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      });
    }
    if (pathname === "/api/auth/me") return fulfillJson(route, sessionUser);
    if (pathname === "/api/notifications/unread-count") return fulfillJson(route, { count: 0 });
    if (pathname === "/api/notifications") return fulfillJson(route, []);
    if (pathname === "/api/customers") {
      return fulfillJson(route, [
        {
          id: "customer-1",
          name: "Taylor Morgan",
          email: "taylor@example.test",
          phone: "515-555-0101",
          createdAt: "2026-07-11T12:00:00.000Z",
        },
      ]);
    }
    if (pathname === "/api/jobs") {
      const rows = [
        {
          id: "job-scheduled",
          customerId: "customer-1",
          title: "Washer not draining",
          status: "scheduled",
          scheduledAt: "2026-07-11T14:00:00.000Z",
          createdAt: "2026-07-11T12:00:00.000Z",
          ...(sessionUser.role === "owner"
            ? { total: 18900, laborCostCents: 0 }
            : { financialsRestricted: true }),
        },
        {
          id: "job-active",
          customerId: "customer-1",
          title: "Refrigerator warm",
          status: "in_progress",
          scheduledAt: "2026-07-11T16:00:00.000Z",
          createdAt: "2026-07-11T12:00:00.000Z",
          ...(sessionUser.role === "owner"
            ? { total: 22900, laborCostCents: 0 }
            : { financialsRestricted: true }),
        },
        {
          id: "job-completed",
          customerId: "customer-1",
          title: "Dryer no heat",
          status: "completed",
          scheduledAt: "2026-07-11T18:00:00.000Z",
          createdAt: "2026-07-11T12:00:00.000Z",
          ...(sessionUser.role === "owner"
            ? { total: 31900, laborCostCents: 0 }
            : { financialsRestricted: true }),
        },
      ];
      return fulfillJson(route, rows);
    }
    if (pathname === "/api/invoices") {
      return sessionUser.role === "technician"
        ? fulfillJson(route, { error: "insufficient role for this operation" }, 403)
        : fulfillJson(route, []);
    }
    if (pathname === "/api/users") {
      return fulfillJson(route, [
        {
          ...sessionUser,
          orgId: "org-1",
          active: true,
          createdAt: "2026-07-11T12:00:00.000Z",
        },
      ]);
    }

    return fulfillJson(route, []);
  });
}

async function addSessionCookie(page: Page, sessionUser: SessionUser = owner) {
  await page.context().addCookies([
    {
      name: "ofp_session",
      value: sessionCookieValue(sessionUser),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function resetServerRequests(page: Page) {
  const response = await page.request.post("http://127.0.0.1:3001/__reset");
  expect(response.ok()).toBe(true);
}

async function serverRequestPaths(page: Page) {
  const response = await page.request.get("http://127.0.0.1:3001/__requests");
  expect(response.ok()).toBe(true);
  const body = await response.json() as { requests: Array<{ path: string }> };
  return body.requests.map((request) => request.path);
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("desktop login uses an HTTP-only session and exposes sign out", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await mockSessionApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("New organization registration is controlled by the deployment owner")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.screenshot({ path: path.join(artifactDir, "login-desktop.png"), fullPage: true });

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Morgan Owner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ofp_token"))).toBeNull();

  const cookies = await page.context().cookies("http://127.0.0.1:3001");
  const sessionCookie = cookies.find((cookie) => cookie.name === "ofp_session");
  expect(sessionCookie).toBeTruthy();
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");

  await page.screenshot({
    path: path.join(artifactDir, "authenticated-sidebar-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("mobile drawer shows the authenticated owner and secure sign out", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await mockSessionApi(page);
  await addSessionCookie(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs/new");
  await page.getByRole("button", { name: "Open navigation menu" }).click();

  await expect(page.getByText("Morgan Owner")).toBeVisible();
  await expect(page.getByText("owner", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: path.join(artifactDir, "authenticated-mobile-drawer.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => localStorage.getItem("ofp_token"))).toBeNull();
  expect(runtimeErrors).toEqual([]);
});

test("technician field board never requests invoices or exposes office navigation", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const requestedPaths: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http://127.0.0.1:3001/api/")) {
      requestedPaths.push(new URL(request.url()).pathname);
    }
  });
  await mockSessionApi(page, technician);
  await addSessionCookie(page, technician);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/closeout");

  await expect(page.getByRole("heading", { name: "Field board" })).toBeVisible();
  await expect(page.getByText("Start assigned work, complete the visit, and hand the result back to the office without exposing billing controls.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Washer not draining" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Refrigerator warm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completed handoff" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices & Payments" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New Job" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dispatch Board" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  expect(requestedPaths).not.toContain("/api/invoices");

  await page.screenshot({
    path: path.join(artifactDir, "technician-field-board-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByText("Alex Rivera")).toBeVisible();
  await expect(page.getByRole("link", { name: "Jobs", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Job Closeout" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Customers & Equipment" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Price Book" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices & Payments" })).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(artifactDir, "technician-navigation-mobile.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});

test("technician jobs list is assignment-only and contains no financial UI", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await mockSessionApi(page, technician);
  await addSessionCookie(page, technician);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "Assigned jobs" })).toBeVisible();
  await expect(page.getByText("Washer not draining")).toBeVisible();
  await expect(page.getByText("Refrigerator warm")).toBeVisible();
  await expect(page.getByRole("link", { name: /New job/i })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: /Total/ })).toHaveCount(0);
  await expect(page.getByTestId("technician-jobs-list")).not.toContainText("$");

  const requestPaths = await serverRequestPaths(page);
  expect(requestPaths).toContain("/api/jobs");
  expect(requestPaths).toContain("/api/customers");
  expect(requestPaths).not.toContain("/api/invoices");

  await page.screenshot({
    path: path.join(artifactDir, "technician-jobs-desktop.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});

test("technician job detail omits invoice requests, pricing, and scheduling controls", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await mockSessionApi(page, technician);
  await addSessionCookie(page, technician);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jobs/job-scheduled");

  await expect(page.getByRole("heading", { name: "Washer not draining" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parts and work recorded" })).toBeVisible();
  await expect(page.getByText("Drain pump")).toBeVisible();
  await expect(page.getByText("Pricing and cost information are handled by the office after field handoff.")).toBeVisible();
  await expect(page.getByText("Current total")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Invoices" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Schedule this job" })).toHaveCount(0);
  await expect(page.getByTestId("technician-job-detail")).not.toContainText("$");

  const requestPaths = await serverRequestPaths(page);
  expect(requestPaths).toContain("/api/jobs/job-scheduled");
  expect(requestPaths).toContain("/api/jobs/job-scheduled/line-items");
  expect(requestPaths).not.toContain("/api/invoices");

  await page.screenshot({
    path: path.join(artifactDir, "technician-job-detail-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(artifactDir, "technician-job-detail-mobile.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});
