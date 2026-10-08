import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  enroll,
  openAccounts,
  expectCompactWorkspace,
} from "./helpers";

test("manage monthly expectations, confirm suggestions and record actual activity", async ({
  page,
}) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  for (const name of ["Synthetic current", "Synthetic savings"]) {
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByLabel("Account name").fill(name);
    await page.getByLabel("Currency", { exact: true }).fill("CHF");
    await page.getByLabel("Opening balance", { exact: true }).fill("100");
    await page.getByLabel("Opening date").fill("2020-01-01");
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("navigation").getByRole("link", { name: "Expected", exact: true }).click();
  await expect(page.getByText(/No expected items/)).toBeVisible();
  await expectCompactWorkspace(page);
  const month = await page.getByLabel("Expected month").inputValue();
  for (const [name, kind] of [
    ["Synthetic rent", "EXPENSE"],
    ["Synthetic salary", "INCOME"],
    ["Synthetic savings transfer", "TRANSFER"],
  ]) {
    await page.getByRole("button", { name: "Add recurring item", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Type", { exact: true }).selectOption(kind);
    await page
      .getByLabel(kind === "TRANSFER" ? "Source account" : "Account", { exact: true })
      .selectOption({ label: "Synthetic current · CHF" });
    if (kind === "TRANSFER")
      await page
        .getByLabel("Destination account", { exact: true })
        .selectOption({ label: "Synthetic savings" });
    await page.getByLabel("Monthly amount (CHF)").fill("10.12345678");
    await page.getByRole("button", { name: "Save recurring item", exact: true }).click();
    await expect(page.getByRole("button", { name: `Edit ${name}`, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Skip Synthetic salary", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo skip Synthetic salary", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo skip Synthetic salary", exact: true }).click();
  await page.getByRole("button", { name: "Record Synthetic rent", exact: true }).click();
  await expect(page.getByLabel("Actual amount (CHF)")).toHaveValue("10.12345678");
  await page.getByLabel("Actual amount (CHF)").fill("12");
  await page.getByRole("button", { name: "Save actual transaction", exact: true }).click();
  const rent = page
    .getByRole("row")
    .filter({ has: page.getByText("Synthetic rent", { exact: true }) });
  await expect(rent).toContainText("Completed");
  await expect(rent).toContainText("Difference 1.88 CHF");
  await rent.getByRole("button", { name: "Unlink Synthetic rent", exact: true }).click();
  await rent.getByRole("button", { name: "Match Synthetic rent", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Match Synthetic rent", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm match", exact: true }).click();
  await expect(rent).toContainText("Completed");
  await page
    .getByRole("button", { name: "Record Synthetic savings transfer", exact: true })
    .click();
  await page.getByRole("button", { name: "Save actual transaction", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByText("Synthetic savings transfer", { exact: true }) }),
  ).toContainText("Completed");
  await page.getByRole("button", { name: "Next month", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Expected month")).not.toHaveValue(month);
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);
  await expectCompactWorkspace(page);
  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await expect(rent).toContainText("Completed");
  await rent.getByRole("button", { name: "Edit Synthetic rent", exact: true }).click();
  await page.getByLabel("Monthly amount (CHF)").fill("20");
  await page.getByRole("button", { name: "Save recurring item", exact: true }).click();
  await expect(rent).toContainText("Difference -8.00 CHF");
  await rent.getByRole("button", { name: "Delete Synthetic rent", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
  await expect(rent).toHaveCount(0);
});
