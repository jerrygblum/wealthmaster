import { expect, test } from "@playwright/test";
import { enroll, openAccounts, passwordLogin, syntheticUser } from "./helpers";
import type { FinancialAccount } from "../src/types/models";

test("fund ISIN, units and dated manual NAV history contribute to account value and net worth", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Account name").fill("Synthetic fund broker");
  await page.getByLabel("Account type").selectOption("INVESTMENT");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening cash balance").fill("100");
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await page
    .getByRole("heading", { name: "Synthetic fund broker", exact: true })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Add fund by ISIN" }).click();
  await page.getByLabel("Fund name").fill("Synthetic Swiss fund");
  await page.getByLabel("Fund ISIN").fill("CH0000000007");
  await page.getByLabel("Fund currency").fill("CHF");
  await page.getByRole("button", { name: "Create fund", exact: true }).click();
  await expect(page.getByText(/Fund created/)).toBeVisible();
  await page.getByLabel("Units to add").fill("2.5");
  await page.getByLabel("Held as of").fill("2024-01-01");
  await page.getByRole("button", { name: "Save holding" }).click();
  await expect(page.getByText(/Fund holding added. Cash is unchanged/)).toBeVisible();
  await expect(page.getByRole("cell").filter({ hasText: "No NAV" })).toBeVisible();
  await page.getByRole("button", { name: "Update NAV / history" }).click();
  const panel = page.getByRole("region", { name: "Fund NAV entry and history" });
  await expect(panel.getByText("No NAV entries yet.")).toBeVisible();
  async function enterNav(nav: string, date: string) {
    await panel.getByLabel("Published NAV per unit (CHF)").fill(nav);
    await panel.getByLabel("NAV valuation date").fill(date);
    await panel.getByLabel("Source reference (optional)").fill("Synthetic NAV bulletin");
    await panel.getByRole("button", { name: "Save NAV", exact: true }).click();
    await expect(page.getByText(/NAV saved. Fund value and net worth updated/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save NAV", exact: true })).toBeEnabled();
  }
  await enterNav("100.12345", "2024-01-02");
  const accountValue = page.getByRole("region", { name: "Investment account value" });
  await expect(accountValue.getByText("CHF 350.31", { exact: true })).toBeVisible();
  const accounts = (await (
    await page.request.get("/api/v1/accounts")
  ).json()) as FinancialAccount[];
  const account = accounts.find((a) => a.name === "Synthetic fund broker")!;
  const read = async () =>
    (await (await page.request.get(`/api/v1/accounts/${account.id}`)).json()) as FinancialAccount;
  expect((await read()).valuation?.totalValue).toBe("350.308625");
  expect((await read()).currentBalance).toBe("100.00000000");
  await enterNav("90", "2024-01-01");
  expect((await read()).valuation?.totalValue).toBe("350.308625");
  await enterNav("110", "2024-01-02");
  await expect(accountValue.getByText("CHF 375.00", { exact: true })).toBeVisible();
  await expect(panel.getByRole("row")).toHaveCount(4);
  await page.getByRole("button", { name: "Close NAV history" }).click();
  await expect(page.getByRole("img", { name: /manual NAV history/ })).toBeVisible();
  await page.getByRole("button", { name: "Refresh prices", exact: true }).click();
  await expect(page.getByText(/uses a manually entered NAV/)).toBeVisible();
  expect((await read()).valuation?.totalValue).toBe("375");
  await page.reload();
  await expect(accountValue.getByText("CHF 375.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Update NAV / history" }).click();
  await expect(panel.getByRole("row")).toHaveCount(4);
  await page.getByRole("button", { name: "Close NAV history" }).click();
  await page.getByRole("link", { name: "Net worth", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "CHF net worth", exact: true }).locator(".net-worth-total"),
  ).toHaveText("CHF 375.00");
  await page.getByRole("link", { name: "Synthetic fund broker", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Holdings", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("fund-holdings.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
