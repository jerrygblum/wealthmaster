import type { CategoryList } from "../src/types/models";
import { test, expect } from "@playwright/test";
import { syntheticUser, passwordLogin, enroll, openAccounts } from "./helpers";

test("manage categories, categorize expenses/refunds, retain archived history and handle stale edits", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Categories", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add starter categories" })).toBeVisible();
  for (const category of [
    { name: "Synthetic Food", type: "SPENDING", parent: null },
    { name: "Synthetic Groceries", type: "SPENDING", parent: "Synthetic Food" },
    { name: "Synthetic Salary", type: "INCOME", parent: null },
  ]) {
    await page.getByRole("button", { name: "Create category", exact: true }).click();
    await page.getByLabel("Category name").fill(category.name);
    await page.getByLabel("Category type").selectOption(category.type);
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
  await expect(page.getByRole("button", { name: "Add starter categories" })).toHaveCount(0);
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
    { kind: "EXPENSE", amount: "10", description: "Synthetic purchase" },
    { kind: "REFUND", amount: "2", description: "Synthetic refund" },
  ]) {
    await page.getByRole("button", { name: "Add transaction" }).click();
    await page.getByLabel("Kind").selectOption(entry.kind);
    await page
      .getByLabel("Category (optional)")
      .selectOption({ label: "Synthetic Food → Synthetic Groceries" });
    await page.getByLabel("Amount (CHF)").fill(entry.amount);
    await page.getByLabel("Description", { exact: true }).fill(entry.description);
    await page.getByRole("button", { name: "Save activity" }).click();
    await expect(page.getByRole("heading", { name: entry.description, exact: true })).toBeVisible();
  }
  await expect(page.locator(".balance")).toHaveText("CHF 92.00000000");
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  const child = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Synthetic Food → Synthetic Groceries", exact: true }),
  });
  await child.locator(".category-actions summary").click();
  await child.getByRole("button", { name: "Edit category" }).click();
  await expect(page.getByLabel("Parent category (optional)")).toBeDisabled();
  await page.getByLabel("Category name").fill("Synthetic Shopping");
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Food → Synthetic Shopping", exact: true }),
  ).toBeVisible();
  const food = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Food", exact: true }) });
  await food.locator(".category-actions summary").click();
  await food.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archived categories" }).click();
  await expect(page.getByText("Unavailable while parent is archived")).toBeVisible();
  const archivedChild = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Synthetic Food → Synthetic Shopping", exact: true }),
  });
  await archivedChild.locator(".category-actions summary").click();
  await expect(archivedChild.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await openAccounts(page);
  await page
    .getByRole("heading", { name: "Synthetic cash", exact: true })
    .getByRole("button")
    .click();
  await expect(
    page.getByText("Category: Synthetic Food → Synthetic Shopping (archived)"),
  ).toHaveCount(2);
  const purchase = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic purchase", exact: true }) });
  await purchase.getByRole("button", { name: "Edit entry" }).click();
  await expect(page.getByLabel("Category (optional)")).not.toHaveValue("");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic corrected purchase");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic corrected purchase", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(
    page.getByRole("option", {
      name: "Synthetic Food → Synthetic Shopping (archived)",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const corrected = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Synthetic corrected purchase", exact: true }),
  });
  await corrected.getByRole("button", { name: "Edit entry" }).click();
  await page.getByLabel("Category (optional)").selectOption("");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(corrected.getByText("Category: Uncategorized")).toBeVisible();
  await expect(page.locator(".balance")).toHaveText("CHF 92.00000000");
  await page.getByRole("link", { name: "Net worth", exact: true }).click();
  await expect(page.locator(".net-worth-total")).toHaveText("CHF 92");
  await page.reload();
  await expect(page.locator(".net-worth-total")).toHaveText("CHF 92");
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Archived categories" }).click();
  const archivedFood = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Food", exact: true }) });
  await archivedFood.locator(".category-actions summary").click();
  await archivedFood.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Active categories" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Food → Synthetic Shopping", exact: true }),
  ).toBeVisible();
  const salary = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Salary", exact: true }) });
  await salary.getByRole("button", { name: "Edit category" }).click();
  await page.getByLabel("Category name").fill("Synthetic renamed salary");
  const categories = (await (await page.request.get("/api/v1/categories")).json()) as CategoryList;
  const target = categories.items.find((c: { name: string }) => c.name === "Synthetic Salary");
  const csrf = (await (await page.request.get("/api/v1/auth/csrf")).json()) as {
    headerName: string;
    token: string;
  };
  const response = await page.request.post(`/api/v1/categories/${target!.id}/archive`, {
    headers: { [csrf.headerName]: csrf.token, "If-Match": `"${target!.version}"` },
  });
  expect(response.ok()).toBe(true);
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Category name")).toHaveValue("Synthetic renamed salary");
  await expect(page.getByRole("button", { name: "Save category" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Archived categories" }).click();
  await salary.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delete Synthetic Salary?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Salary", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Active categories" }).click();
  await page.screenshot({ path: testInfo.outputPath("categories.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
