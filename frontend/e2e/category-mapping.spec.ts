import { expect, test } from "@playwright/test";
import type { Category, FinancialAccount, Operation } from "../src/types/models";
import { enroll, passwordLogin, syntheticUser } from "./helpers";

test("reviews original category groups and assigns existing categories without changing balances", async ({
  page,
}) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  async function create<T>(path: string, data: Record<string, unknown>): Promise<T> {
    const csrf = (await (await page.request.get("/api/v1/auth/csrf")).json()) as {
      headerName: string;
      token: string;
    };
    const response = await page.request.post(`/api/v1${path}`, {
      headers: { [csrf.headerName]: csrf.token, "Content-Type": "application/json" },
      data: JSON.stringify(data),
    });
    expect(response.status()).toBe(201);
    return response.json() as Promise<T>;
  }
  const account = await create<FinancialAccount>("/accounts", {
    name: "Synthetic mapping account",
    type: "CASH",
    currency: "CHF",
    openingAmount: "100",
    balanceMeaning: "BALANCE",
    openingDate: "2020-01-01",
  });
  const category = await create<Category>("/categories", {
    name: "Synthetic groceries",
    type: "SPENDING",
  });
  const expense = await create<Operation>("/transactions", {
    accountId: account.id,
    kind: "EXPENSE",
    amount: "25.10",
    transactionDate: "2024-01-05",
    description: "Synthetic purchase | Original category: Legacy food",
  });
  await create<Operation>("/transactions", {
    accountId: account.id,
    kind: "REFUND",
    amount: "5.10",
    transactionDate: "2024-01-06",
    description: "Synthetic refund | Original category: Legacy food",
  });
  await page.getByRole("link", { name: "Category mapping", exact: true }).click();
  await page.getByRole("button", { name: "Review Legacy food (Spending)" }).click();
  await expect(page.getByText("2 transactions · 2 uncategorized")).toBeVisible();
  await expect(page.getByText(expense.description)).toBeVisible();
  await page.getByLabel("Map to existing category").selectOption(category.id);
  await page.getByRole("button", { name: "Map 2 transactions" }).click();
  await page.getByRole("button", { name: "Confirm mapping" }).click();
  await expect(page.getByText(/2 transactions categorized/)).toBeVisible();
  await expect(page.getByText("No original categories left to map")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No original categories left to map")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Legacy food (Spending)" })).toHaveCount(0);
  const activity = (await (
    await page.request.get(`/api/v1/transactions?accountId=${account.id}`)
  ).json()) as { items: Operation[] };
  expect(activity.items.every((row) => row.categoryId === category.id)).toBe(true);
  expect(activity.items.find((row) => row.id === expense.id)?.description).toBe(
    expense.description,
  );
  const accounts = (await (
    await page.request.get("/api/v1/accounts")
  ).json()) as (FinancialAccount & { currentBalance: string })[];
  expect(accounts.find((row) => row.id === account.id)?.currentBalance).toBe("80.00000000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
