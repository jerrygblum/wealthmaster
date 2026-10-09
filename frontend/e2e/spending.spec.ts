import type { SpendingReport } from "../src/types/models";
import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  enroll,
  openAccounts,
  expectCompactWorkspace,
} from "./helpers";

test("spending periods, category breakdowns, refunds and archived activity", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expectCompactWorkspace(page);
  await page.getByLabel("Default currency (ISO code)").fill("CHF");
  await page.getByRole("button", { name: "Save default currency" }).click();
  await expect(page.getByText("Default currency saved.")).toBeVisible();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  for (const category of [
    { name: "Synthetic Food", parent: null },
    { name: "Synthetic Groceries", parent: "Synthetic Food" },
  ]) {
    await page.getByRole("button", { name: "Create category", exact: true }).click();
    await page.getByLabel("Category name").fill(category.name);
    if (category.parent)
      await page.getByLabel("Parent category (optional)").selectOption({ label: category.parent });
    await page.getByRole("button", { name: "Save category" }).click();
    await expect(
      page.getByRole("heading", {
        name: category.parent ? `${category.parent} → ${category.name}` : category.name,
        exact: true,
      }),
    ).toBeVisible();
  }
  await openAccounts(page);
  await page.getByRole("button", { name: "Create your first account" }).click();
  await page.getByLabel("Account name").fill("Synthetic cash");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening balance", { exact: true }).fill("100");
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByRole("button", { name: "Save account" }).click();
  await page
    .getByRole("heading", { name: "Synthetic cash", exact: true })
    .getByRole("button")
    .click();
  for (const entry of [
    {
      kind: "EXPENSE",
      amount: "10.12345678",
      description: "Synthetic purchase",
      category: "Synthetic Food → Synthetic Groceries",
    },
    {
      kind: "REFUND",
      amount: "12",
      description: "Synthetic refund",
      category: "Synthetic Food → Synthetic Groceries",
    },
    { kind: "EXPENSE", amount: "3", description: "Synthetic uncategorized", category: null },
  ]) {
    await page.getByRole("button", { name: "Add transaction" }).click();
    await page.getByLabel("Kind").selectOption(entry.kind);
    if (entry.category)
      await page.getByLabel("Category (optional)").selectOption({ label: entry.category });
    await page.getByLabel("Amount (CHF)").fill(entry.amount);
    await page.getByLabel("Description", { exact: true }).fill(entry.description);
    await page.getByRole("button", { name: "Save activity" }).click();
    await expect(page.getByText(entry.description, { exact: true })).toBeVisible();
  }
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show period", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh spending", exact: true })).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeVisible();
  await expectCompactWorkspace(page);
  await expect(page.getByRole("img", { name: /Expenses before refunds/ })).toHaveCount(0);
  await expect(page.getByText(/Uncategorized net spending: 3.00/)).toBeVisible();
  await page.getByRole("button", { name: "Expand Synthetic Food" }).click();
  await expect(page.getByText("-1.88", { exact: true })).toHaveCount(2);
  const report = (await (await page.request.get("/api/v1/spending")).json()) as SpendingReport;
  expect(report.currencies.find((c) => c.currency === "CHF")?.expenses).toBe("13.12345678");
  await expect(page.getByRole("table").getByRole("link", { name: "Manage limit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.getByLabel("Period", { exact: true })).toHaveAttribute("type", "number");
  await expect(page.getByRole("table").getByText("-1.88", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByLabel("Period", { exact: true })).toHaveAttribute("type", "month");
  await expect(page.getByRole("button", { name: "Previous period" })).toBeEnabled();
  await page.getByRole("button", { name: "Previous period" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Next period" })).toBeEnabled();
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(page.getByLabel("Period", { exact: true })).toBeEnabled();
  await page.getByLabel("Period", { exact: true }).fill(report.periodStart.slice(0, 7));
  await expect(page.getByText(/Uncategorized net spending: 3.00/)).toBeVisible();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  const food = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Food", exact: true }) });
  await food.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(page.getByText(/Synthetic Food \(inclusive\) \(archived branch\)/)).toBeVisible();
  await expect(page.getByText(/Uncategorized net spending: 3.00/)).toBeVisible();
  await page.getByRole("button", { name: "Supporting activity" }).first().click();
  await expect(page.getByRole("link", { name: "Open account" })).toHaveCount(2);
  await page.getByRole("button", { name: "Close activity" }).click();
  await page.goto("/#/planning");
  await expect(page.getByRole("heading", { name: "Spending", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand Synthetic Food" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Collapse Synthetic Food" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("spending.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Default currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Save default currency" }).click();
  await expect(page.getByText("Default currency saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm currency change" })).toHaveCount(0);
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  const resetReport = (await (await page.request.get("/api/v1/spending")).json()) as SpendingReport;
  expect(resetReport.currencies.find((c) => c.currency === "CHF")?.expenses).toBe("13.12345678");
});
