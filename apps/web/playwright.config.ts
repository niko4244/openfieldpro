import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.OFP_WEB_E2E_PORT ?? 3000);
const webHost = process.env.OFP_WEB_E2E_HOST ?? "127.0.0.1";
const urlHost = webHost.includes(":") ? `[${webHost}]` : webHost;
const baseURL = `http://${urlHost}:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Exercise the same optimized server shipped to customers. CI builds immediately before this suite.
    command: `pnpm exec next start -H ${webHost} -p ${webPort}`,
    url: `${baseURL}/dispatch`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001",
    },
  },
});
