import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  timeout: 120_000,
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    channel: process.env.E2E_BROWSER_CHANNEL,
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "mvn --batch-mode -f ../backend/pom.xml spring-boot:run",
          url: "http://127.0.0.1:8081/actuator/health",
          timeout: 120_000,
          env: {
            SERVER_PORT: "8081",
            SPRING_PROFILES_ACTIVE: process.env.E2E_PROFILE ?? "dev",
            SESSION_COOKIE_SECURE: "false",
            MFA_ENCRYPTION_PASSWORD: "synthetic-e2e-encryption-password-only",
            MFA_ENCRYPTION_SALT: "0123456789abcdef0123456789abcdef",
            INITIAL_OWNER_EMAIL: "owner@example.test",
            INITIAL_OWNER_PASSWORD: "synthetic-password",
          },
        },
        {
          command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
          url: "http://127.0.0.1:5174",
          timeout: 30_000,
          env: { VITE_API_TARGET: "http://127.0.0.1:8081" },
        },
      ],
});
