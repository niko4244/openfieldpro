import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

function collectRuntimeErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("browser login receives only the HTTP-only session and public identity", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const user = {
    id: "owner-1",
    name: "Morgan Owner",
    email: "owner@example.test",
    role: "owner",
  };

  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/login" && request.method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "set-cookie": "ofp_session=owner-session; Path=/; HttpOnly; SameSite=Lax",
          "cache-control": "no-store",
        },
        body: JSON.stringify({ user, orgId: "org-1" }),
      });
    }
    if (pathname === "/api/auth/me") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    }
    if (pathname === "/api/notifications/unread-count") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) });
    }
    if (pathname === "/api/notifications") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");

  const loginResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;
  const body = await loginResponse.json() as Record<string, unknown>;

  expect(body).toEqual({ user, orgId: "org-1" });
  expect(body).not.toHaveProperty("token");
  expect(await page.evaluate(() => localStorage.getItem("ofp_token"))).toBeNull();

  const cookies = await page.context().cookies("http://127.0.0.1:3001");
  const session = cookies.find((cookie) => cookie.name === "ofp_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");

  await page.screenshot({
    path: path.join(artifactDir, "browser-cookie-only-auth-desktop.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});
