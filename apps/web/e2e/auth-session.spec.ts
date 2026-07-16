import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");
const user = {
  id: "owner-1",
  name: "Morgan Owner",
  email: "owner@example.test",
  role: "owner",
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

async function mockSessionApi(page: Page) {
  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/login" && request.method() === "POST") {
      return fulfillJson(
        route,
        { token: "header.payload.signature", user, orgId: "org-1" },
        200,
        {
          "set-cookie": "ofp_session=header.payload.signature; Path=/; HttpOnly; SameSite=Lax",
        },
      );
    }
    if (pathname === "/api/auth/logout" && request.method() === "POST") {
      return fulfillJson(route, { ok: true }, 200, {
        "set-cookie": "ofp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      });
    }
    if (pathname === "/api/auth/me") return fulfillJson(route, user);
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
    if (pathname === "/api/users") {
      return fulfillJson(route, [
        {
          id: user.id,
          orgId: "org-1",
          email: user.email,
          name: user.name,
          role: user.role,
          active: true,
          createdAt: "2026-07-11T12:00:00.000Z",
        },
      ]);
    }

    return fulfillJson(route, []);
  });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("desktop login uses an HTTP-only session and exposes sign out", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await mockSessionApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.goto("/login");

  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("New organization registration is controlled by the deployment owner")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.screenshot({ path: path.join(artifactDir, "login-desktop.png"), fullPage: true });

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  const accountPanel = page.getByRole("complementary");
  await expect(accountPanel.getByText("Morgan Owner")).toBeVisible();
  await expect(accountPanel.getByRole("button", { name: "Sign out" })).toBeVisible();
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

  await accountPanel.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("mobile drawer shows the authenticated user and secure sign out", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await mockSessionApi(page);
  await page.context().addCookies([
    {
      name: "ofp_session",
      value: "header.payload.signature",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs/new");
  await page.getByRole("button", { name: "Open navigation menu" }).click();

  const accountPanel = page.getByRole("complementary");
  await expect(accountPanel.getByText("Morgan Owner")).toBeVisible();
  await expect(accountPanel.getByText("owner", { exact: true })).toBeVisible();
  await expect(accountPanel.getByRole("button", { name: "Sign out" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: path.join(artifactDir, "authenticated-mobile-drawer.png"),
    fullPage: true,
  });

  await accountPanel.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => localStorage.getItem("ofp_token"))).toBeNull();
  expect(runtimeErrors).toEqual([]);
});

test("an invalid customer portal link fails closed without placeholder billing data", async ({ page }) => {
  await page.goto("/portal/not-a-valid-portal-link");

  await expect(page.getByRole("heading", { name: "This portal link is unavailable" })).toBeVisible();
  await expect(page.getByText("No customer or billing information has been displayed.")).toBeVisible();
  await expect(page.getByText("$0.00 collected")).toHaveCount(0);
  await expect(page.getByText("✓ Invoice payment link surface")).toHaveCount(0);
});
