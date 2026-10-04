import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { channel: process.env.E2E_BROWSER_CHANNEL, baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : [
    {
      command: "mvn --batch-mode -f ../backend/pom.xml spring-boot:run",
      url: "http://127.0.0.1:8080/actuator/health",
      timeout: 120_000,
      env: {
        SPRING_PROFILES_ACTIVE: "dev",
        SESSION_COOKIE_SECURE: "false",
        INITIAL_OWNER_EMAIL: "owner@example.test",
        INITIAL_OWNER_PASSWORD: "synthetic-password",
      },
    },
    { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", timeout: 30_000 },
  ],
});
