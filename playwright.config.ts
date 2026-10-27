import { defineConfig } from "@playwright/test";
// This installed Playwright version includes input values in its automatic
// AI error-context snapshot, including password fields. Keep it disabled.
process.env.PLAYWRIGHT_NO_COPY_PROMPT='1';
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SYNAPSE_TEST_ORIGIN??"http://localhost:3000",
    channel: "msedge",
    headless: true,
    viewport: { width: 1536, height: 1024 },
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: process.env.SYNAPSE_EXTERNAL_TEST_SERVER==='true'?undefined:{
    command: "npm run dev",
    url: "http://localhost:3000/dashboard",
    reuseExistingServer: true,
    timeout: 180000,
  },
});
