import { test, expect } from "@playwright/test";
import { syntheticUser, passwordLogin, enroll } from "./helpers";

test("login, create an account, reload, and log out", async ({ page }, testInfo) => {
  const name = `Synthetic savings ${testInfo.project.name} ${Date.now()}`;
  const email = await syntheticUser();
  const status = await passwordLogin(page, email);
  if (status === "MFA_SETUP_REQUIRED") { await enroll(page); }
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Account name").fill(name);
  await page.getByLabel("Account type").selectOption("SAVINGS");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening balance", { exact: true }).fill("1234.56");
  await page.getByLabel("Opening date").fill("2026-10-04");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.reload();
  const account = page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(account).toContainText("CHF 1’234.56");
  await expect(account).toContainText("2026-10-04");
  await page.screenshot({ path: testInfo.outputPath("accounts.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect((await page.request.get("/api/v1/accounts")).status()).toBe(401);
});
