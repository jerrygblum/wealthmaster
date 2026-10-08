import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  enroll,
  openAccounts,
  expectCompactWorkspace,
} from "./helpers";

test("cash activity, refunds and paired transfer corrections survive reload", async ({ page }) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  for (const name of ["Synthetic bank", "Synthetic card"]) {
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByLabel("Account name").fill(name);
    await page
      .getByLabel("Account type")
      .selectOption(name.endsWith("card") ? "CREDIT_CARD" : "CHECKING");
    await page.getByLabel("Currency", { exact: true }).fill("CHF");
    await page.getByLabel("Opening date").fill("2020-01-01");
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Synthetic card", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic card", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Amount (CHF)").fill("100.12345678");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic purchase");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 100.12");
  await expect(page.getByText("Amount owed", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Kind").selectOption("REFUND");
  await page.getByLabel("Amount (CHF)").fill("10.12345678");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic refund");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 90.00");
  await page.reload();
  await expect(page.locator(".balance")).toHaveText("CHF 90.00");
  await page.getByRole("button", { name: "Transfer money" }).click();
  await page.getByLabel("Source account").selectOption({ label: "Synthetic bank" });
  await page.getByLabel("Destination account").selectOption({ label: "Synthetic card" });
  await page.getByLabel("Amount (CHF)").fill("100");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic repayment");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 10.00");
  const transfer = page
    .getByRole("row")
    .filter({ has: page.getByText("Synthetic repayment", { exact: true }) });
  await expectCompactWorkspace(page);
  const edit = transfer.getByRole("button", { name: "Edit entry" });
  await expect(edit).toHaveAttribute("title", "Edit Synthetic repayment");
  const size = await edit.evaluate((button) => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
    mobile: window.innerWidth <= 720,
  }));
  expect(size.width).toBe(size.mobile ? 40 : 32);
  expect(size.height).toBe(size.mobile ? 40 : 32);
  await edit.focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Amount (CHF)").fill("90");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 0.00");
  await transfer.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByText(/Both sides of this transfer/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 90.00");
  const purchase = page
    .getByRole("row")
    .filter({ has: page.getByText("Synthetic purchase", { exact: true }) });
  await purchase.getByRole("button", { name: "Edit entry" }).click();
  await page.getByLabel("Amount (CHF)").fill("50");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 39.88");
  await purchase.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.locator(".balance")).toHaveText("CHF 10.12");
  await page.reload();
  await expect(page.locator(".balance")).toHaveText("CHF 10.12");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Kind").selectOption("INCOME");
  await page.getByLabel("Amount (CHF)").fill("100");
  await page.getByLabel("Transaction date").fill("2099-01-01");
  await page.getByLabel("Value date (optional)").fill("2099-01-02");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic future income");
  await page.getByRole("button", { name: "Save activity" }).click();
  const scheduled = page
    .getByRole("row")
    .filter({ has: page.getByText("Synthetic future income", { exact: true }) });
  await expect(scheduled).toContainText("Scheduled");
  await expect(page.locator(".balance")).toHaveText("CHF 10.12");
  await page.reload();
  await expect(scheduled).toContainText("Scheduled");
  await expect(page.locator(".balance")).toHaveText("CHF 10.12");
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic card", exact: true }) });
  await expect(card.locator(".balance")).toHaveText("CHF 10.12");
  await expect(card.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await card.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archived accounts" }).click();
  await page.getByRole("button", { name: "Synthetic card", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add transaction" })).toBeDisabled();
  await expect(page.getByText("Synthetic refund", { exact: true })).toBeVisible();
});
