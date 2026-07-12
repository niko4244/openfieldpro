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

async function addRoleCookie(page: Page, role: "owner" | "technician") {
  await page.context().addCookies([
    {
      name: "ofp_session",
      value: role === "technician" ? "technician-session" : "owner-session",
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

test("technician Price Book is canonical, read-only, and cost-redacted", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await addRoleCookie(page, "technician");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/price-book");

  await expect(page.getByRole("heading", { name: "Price Book" })).toBeVisible();
  await expect(page.getByText("Field reference only")).toBeVisible();
  await expect(page.getByText("Drain pump replacement")).toBeVisible();
  await expect(page.getByText("$249.00")).toBeVisible();
  await expect(page.getByText("Internal cost")).toHaveCount(0);
  await expect(page.getByText("Gross margin")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add item/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add category/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  const requests = await serverRequestPaths(page);
  expect(requests).toContain("/api/catalog/categories");
  expect(requests).toContain("/api/catalog/items");

  await page.screenshot({
    path: path.join(artifactDir, "technician-price-book-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(artifactDir, "technician-price-book-mobile.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});

test("owner Price Book exposes canonical cost and edit controls", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await addRoleCookie(page, "owner");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/price-book");

  await expect(page.getByRole("heading", { name: "Price Book" })).toBeVisible();
  await expect(page.getByText("Drain pump replacement")).toBeVisible();
  await expect(page.getByText("Internal cost").first()).toBeVisible();
  await expect(page.getByText("Gross margin").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Add item/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add category/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" }).first()).toBeVisible();

  await page.screenshot({
    path: path.join(artifactDir, "owner-price-book-desktop.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});
