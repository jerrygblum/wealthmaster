import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  enroll,
  openAccounts,
  expectCompactWorkspace,
} from "./helpers";

test("trends select individual and grouped accounts, currencies, dates, buckets and archives", async ({
  page,
}) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  for (const fixture of [
    { name: "Synthetic trend bank", currency: "CHF", amount: "100" },
    { name: "Synthetic trend savings", currency: "CHF", amount: "50" },
    { name: "Synthetic trend euro", currency: "EUR", amount: "20" },
  ]) {
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByLabel("Account name").fill(fixture.name);
    await page.getByLabel("Account type").selectOption("CASH");
    await page.getByLabel("Currency", { exact: true }).fill(fixture.currency);
    await page.getByLabel("Opening balance", { exact: true }).fill(fixture.amount);
    await page.getByLabel("Opening date").fill("2024-01-01");
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await expect(page.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();
  }
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic trend savings", exact: true }) })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await page.getByRole("link", { name: "Trends", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Net-worth trends", exact: true })).toBeVisible();
  const chf = page.getByRole("region", { name: "CHF net-worth trend", exact: true });
  await expect(chf.getByRole("cell", { name: "100.00", exact: true }).first()).toBeVisible();
  await expect(page.getByLabel(/Synthetic trend savings/)).not.toBeChecked();
  await expect(
    page.getByRole("region", { name: "EUR net-worth trend", exact: true }),
  ).toBeVisible();
  await page.locator(".trend-account-picker > summary").click();
  await page.getByLabel(/Synthetic trend savings/).check();
  await page.getByLabel(/Synthetic trend euro/).uncheck();
  await page.getByLabel("Start date", { exact: true }).fill("2024-01-15");
  await page.getByLabel("End date", { exact: true }).fill("2024-03-05");
  await page.getByLabel("Time buckets").selectOption("WEEK");
  await page.getByRole("button", { name: "Update trend", exact: true }).click();
  await expect(chf.getByRole("cell", { name: "150.00", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "EUR net-worth trend", exact: true })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/bucket=WEEK/);
  await page.getByLabel("Show account lines").check();
  await expect(chf.getByRole("img", { name: /Synthetic trend savings/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Time buckets")).toHaveValue("WEEK");
  await expect(page.getByLabel(/Synthetic trend savings/)).toBeChecked();
  await page.locator(".trend-account-picker > summary").click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByLabel(/Synthetic trend bank/).check();
  await page.getByLabel("Time buckets").selectOption("MONTH");
  await page.getByRole("button", { name: "Update trend", exact: true }).click();
  await expect(chf.getByRole("cell", { name: "100.00", exact: true }).first()).toBeVisible();
  await expect(chf.getByRole("columnheader", { name: /Synthetic trend savings/ })).toHaveCount(0);
  await expectCompactWorkspace(page);
});
