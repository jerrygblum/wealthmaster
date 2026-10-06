import type { SpendingReport } from "../src/types/models";
import { test, expect } from "@playwright/test";
import { syntheticUser, passwordLogin, enroll, openAccounts } from "./helpers";

test("linked category limits, selected periods, refunds and archived activity", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Default currency (ISO code)").fill("CHF");
  await page.getByRole("button", { name: "Save default currency" }).click();
  await expect(
    page.getByText("Default currency saved. Enter spending limits in Categories."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  for (const category of [
    { name: "Synthetic Food", parent: null },
    { name: "Synthetic Groceries", parent: "Synthetic Food" },
  ]) {
    await page.getByRole("button", { name: "Create category", exact: true }).click();
    await page.getByLabel("Category name").fill(category.name);
    if (category.parent)
      await page.getByLabel("Parent category (optional)").selectOption({ label: category.parent });
    if (!category.parent) {
      await page.getByLabel("Spending limit").selectOption("MONTH");
      await page.getByLabel("Amount (CHF)").fill("100");
    }
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
    await expect(page.getByRole("heading", { name: entry.description, exact: true })).toBeVisible();
  }
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Expenses before refunds", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Without an applicable budget: 3.00/)).toBeVisible();
  await page.getByRole("button", { name: "Expand Synthetic Food" }).click();
  await expect(page.getByText("-1.88", { exact: true })).toHaveCount(2);
  const table = page.getByRole("table");
  await table.getByRole("link", { name: "Manage limit" }).first().click();
  const food = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Food", exact: true }) });
  await expect(food).toHaveAttribute("data-selected", "true");
  for (const b of [{ category: "Synthetic Food", limit: "100" }]) {
    const card = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: b.category, exact: true }) });
    await card.getByRole("button", { name: "Edit category", exact: true }).click();
    await card.getByLabel("Spending limit").selectOption("MONTH");
    await card.getByLabel("Amount (CHF)").fill(b.limit);
    await card.getByRole("button", { name: "Save category" }).click();
    await expect(card.getByText(new RegExp(`${b.limit}.00 CHF / month`))).toBeVisible();
  }
  const childCategory = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Synthetic Food → Synthetic Groceries", exact: true }),
  });
  await expect(childCategory).toContainText("Included in Synthetic Food’s limit");
  await childCategory.getByRole("button", { name: "Edit category", exact: true }).click();
  await expect(childCategory.getByLabel("Spending limit")).toHaveCount(0);
  await childCategory.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("category-limits.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  const report = (await (await page.request.get("/api/v1/spending")).json()) as SpendingReport;
  expect(report.limits[0].limit).toBe("100.00000000");
  await expect(page.getByRole("button", { name: "Edit limit" })).toHaveCount(0);
  await expect(page.getByText("Copy period exceptions", { exact: true })).toHaveCount(0);
  await page.getByLabel("Period type").selectOption("YEAR");
  await expect(page.getByRole("table").getByText("1’200.00 CHF", { exact: true })).toBeVisible();
  await page.getByLabel("Period type").selectOption("MONTH");
  await page.getByRole("link", { name: "Manage limit" }).first().click();
  await food.getByRole("button", { name: "Edit category", exact: true }).click();
  await food.getByLabel("Spending limit").selectOption("YEAR");
  await expect(food.getByLabel("Amount (CHF)")).toHaveValue("1200");
  await food.getByLabel("Amount (CHF)").fill("1440");
  await food.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(food).toContainText("120.00 CHF / month");
  await expect(food).toContainText("1’440.00 CHF / year");
  await food.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(page.getByText(/Synthetic Food \(inclusive\) \(archived branch\)/)).toBeVisible();
  await expect(page.getByText(/Without an applicable budget: 3.00/)).toBeVisible();
  await page.getByRole("button", { name: "Supporting activity" }).first().click();
  await expect(page.getByRole("link", { name: "Open account" })).toHaveCount(2);
  await page.getByRole("button", { name: "Close activity" }).click();
  await page.goto("/#/planning");
  await expect(page.getByRole("heading", { name: "Spending", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Synthetic Food: 10.12/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Collapse Synthetic Food" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("spending.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Default currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Save default currency" }).click();
  await expect(page.getByText(/You must enter your spending limits again/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel currency change" }).click();
  await expect(page.getByLabel("Default currency (ISO code)")).toHaveValue("CHF");
  await page.getByLabel("Default currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Save default currency" }).click();
  await page.getByRole("button", { name: "Confirm currency change" }).click();
  await expect(
    page.getByText("Default currency saved. Enter spending limits in Categories."),
  ).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(page.getByText(/Default currency: EUR/)).toBeVisible();
  const resetReport = (await (await page.request.get("/api/v1/spending")).json()) as SpendingReport;
  expect(resetReport.limits).toHaveLength(0);
  expect(resetReport.currencies.find((c) => c.currency === "CHF")?.expenses).toBe("13.12345678");
});
