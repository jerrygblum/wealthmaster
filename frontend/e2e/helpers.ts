import { randomUUID } from "node:crypto";
import pg from "pg";
import * as OTPAuth from "otpauth";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const password = "synthetic-password";
export async function syntheticUser() {
  const databaseUrl = process.env.DB_URL?.replace(/^jdbc:/, "");
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_e2e")) throw new Error("Browser fixtures require a dedicated database whose name ends in _e2e.");
  const connection = new URL(databaseUrl);
  connection.username = process.env.DB_USER ?? "";
  connection.password = process.env.DB_PASSWORD ?? "";
  const client = new pg.Client({ connectionString: connection.toString() });
  const id = randomUUID(); const email = `synthetic.${id}@example.test`;
  await client.connect();
  try {
    const result = await client.query(`INSERT INTO app_users(id, email, password_hash, created_at)
      SELECT $1, $2, password_hash, CURRENT_TIMESTAMP FROM app_users WHERE email='owner@example.test' RETURNING id`, [id, email]);
    if (result.rowCount !== 1) throw new Error("Synthetic owner must be provisioned before browser fixtures.");
  } finally { await client.end(); }
  return email;
}
export function authenticatorCode(secret: string, offsetSeconds = 0) {
  return new OTPAuth.TOTP({ issuer: "Wealth Master", label: "Synthetic", algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offsetSeconds * 1000 });
}
export async function passwordLogin(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/login" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  return (await (await response).json()).status as string;
}
export async function enroll(page: Page) {
  await page.getByRole("button", { name: "Set up 2FA" }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Continue setup" }).click();
  const secret = await page.locator(".setup-key").innerText();
  await expect(page.getByAltText("Authenticator setup QR code")).toBeVisible();
  await page.getByLabel("Code from your authenticator").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Verify authenticator" }).click();
  const codes = await readCodes(page);
  await expect(page.getByRole("button", { name: "Activate 2FA", exact: true })).toBeDisabled();
  await page.getByLabel("I saved my recovery codes").check();
  await page.getByRole("button", { name: "Activate 2FA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Accounts", exact: true }).or(page.getByText("Enabled", { exact: true }))).toBeVisible();
  return { secret, codes };
}
export async function readCodes(page: Page) {
  await expect(page.locator(".recovery-codes li")).toHaveCount(10);
  return page.locator(".recovery-codes li").allTextContents();
}
export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
}
export async function recoveryLogin(page: Page, email: string, code: string) {
  expect(await passwordLogin(page, email)).toBe("MFA_REQUIRED");
  await page.getByLabel("Verification method").selectOption("RECOVERY");
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
}
