import type { SpendingReport, BudgetReport } from "../src/types/models";
import { test, expect } from "@playwright/test";
import { syntheticUser, passwordLogin, enroll, openAccounts } from "./helpers";

test("spending limits, refunds, copying, archived activity and permanent category locks", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
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
    await expect(page.getByRole("heading", { name: entry.description, exact: true })).toBeVisible();
  }
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Expenses before refunds", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Without an applicable budget: 1.12345678/)).toBeVisible();
  await page.getByRole("button", { name: "Expand Synthetic Food" }).click();
  await expect(page.getByText("-1.87654322", { exact: true })).toHaveCount(2);
  const table = page.getByRole("table");
  await table.getByRole("link", { name: "Normal setting" }).first().click();
  const food = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Food", exact: true }) });
  await expect(food).toHaveAttribute("data-selected", "true");
  for (const b of [
    { category: "Synthetic Food", limit: "100" },
    { category: "Synthetic Food → Synthetic Groceries", limit: "5" },
  ]) {
    const card = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: b.category, exact: true }) });
    await card.getByRole("button", { name: "Monthly", exact: true }).click();
    await card
      .getByLabel(`Normal limit amount for ${b.category.split(" → ").at(-1)} CHF`)
      .fill(b.limit);
    await card.getByRole("button", { name: "Save normal limit" }).click();
    await expect(card.getByRole("button", { name: "Monthly", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.screenshot({ path: testInfo.outputPath("category-limits.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  const report = (await (await page.request.get("/api/v1/spending")).json()) as SpendingReport;
  const period = report.periodStart.slice(0, 7);
  await page.getByRole("button", { name: "Edit limit", exact: true }).first().click();
  await page.getByLabel(`Limit for ${period} (CHF)`).fill("120");
  await expect(page.getByRole("radio", { name: `Only ${period}` })).toBeChecked();
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByText(/ · Exception$/)).toBeVisible();
  await page.getByRole("button", { name: "Edit limit", exact: true }).first().click();
  await page.getByLabel(`Limit for ${period} (CHF)`).fill("130");
  await page.getByRole("radio", { name: "Make this the normal monthly limit" }).check();
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByText(/ · Exception$/)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit limit", exact: true }).first().click();
  await page.getByLabel(`Limit for ${period} (CHF)`).fill("0");
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await page.getByRole("button", { name: "Edit limit", exact: true }).first().click();
  await page.getByLabel(`Limit for ${period} (CHF)`).fill("1.12345678");
  const overrides = (await (await page.request.get("/api/v1/budgets")).json()) as BudgetReport;
  const original = overrides.items.find(
    (b: { categoryName: string }) => b.categoryName === "Synthetic Food",
  );
  const csrf = (await (await page.request.get("/api/v1/auth/csrf")).json()) as {
    headerName: string;
    token: string;
  };
  expect(
    (
      await page.request.put(`/api/v1/budgets/${original!.id}`, {
        headers: { [csrf.headerName]: csrf.token, "If-Match": `"${original!.version}"` },
        data: { limit: "2" },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Save limit" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel(`Limit for ${period} (CHF)`)).toHaveValue("1.12345678");
  await expect(page.getByRole("button", { name: "Save limit" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel limit edit" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Spending", exact: true })).toBeVisible();
  await page.getByText("Copy period exceptions", { exact: true }).click();
  const [year, month] = report.periodStart.split("-").map(Number);
  const target = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  await page.getByRole("checkbox", { name: /Synthetic Food ·/ }).check();
  await page.getByLabel("Target period start").fill(target);
  await page.getByRole("button", { name: "Copy selected exceptions" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Created 1 exceptions" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Synthetic Food ·/ }).check();
  await page.getByRole("button", { name: "Copy selected exceptions" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "target exception already exists" }),
  ).toBeVisible();
  await page.getByLabel("Period type").selectOption("YEAR");
  await page.getByText(`Edit months · ${year}`, { exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Edit monthly limit" })).toHaveCount(12);
  await page.getByLabel("Period type").selectOption("MONTH");
  await page.getByRole("button", { name: "Edit limit", exact: true }).first().click();
  await page.getByRole("button", { name: "Use normal limit" }).click();
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect(page.getByText(/ · Exception$/)).toHaveCount(0);
  await page.getByRole("link", { name: "Normal setting" }).first().click();
  await food.locator(".category-actions summary").click();
  await food.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Spending", exact: true }).click();
  await expect(page.getByText(/Synthetic Food \(inclusive\) \(archived branch\)/)).toBeVisible();
  await expect(page.getByText(/Without an applicable budget: 3.00000000/)).toBeVisible();
  await page.getByRole("button", { name: "Supporting activity" }).first().click();
  await expect(page.getByRole("link", { name: "Open account" })).toHaveCount(2);
  await page.getByRole("button", { name: "Close activity" }).click();
  await page.goto("/#/planning");
  await expect(page.getByRole("heading", { name: "Spending", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Synthetic Food: 10.12345678/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Collapse Synthetic Food" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("spending.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
