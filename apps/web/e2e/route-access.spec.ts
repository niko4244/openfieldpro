import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function addTechnicianCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "ofp_session",
      value: "technician-session",
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

test("unauthenticated private routes redirect to sign in before rendering", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/jobs");

  await expect(page).toHaveURL(/\/login\?next=%2Fjobs$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);

  const requests = await serverRequestPaths(page);
  expect(requests).not.toContain("/api/jobs");
  expect(requests).not.toContain("/api/auth/me");
  expect(runtimeErrors).toEqual([]);
});

test("technician direct invoice access is blocked before invoice data loads", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await addTechnicianCookie(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/invoices");

  await expect(page).toHaveURL(/\/access-denied\?from=%2Finvoices$/);
  await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
  await expect(page.getByText("Your session is valid, but this page is office-restricted.")).toBeVisible();
  await expect(page.getByText("Blocked route: /invoices")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open assigned jobs" })).toBeVisible();

  const requests = await serverRequestPaths(page);
  expect(requests).toContain("/api/auth/me");
  expect(requests).not.toContain("/api/invoices");

  await page.screenshot({
    path: path.join(artifactDir, "technician-access-restricted-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(artifactDir, "technician-access-restricted-mobile.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});
