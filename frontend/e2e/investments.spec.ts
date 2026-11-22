import { expect, test } from "@playwright/test";
import {
  enroll,
  openAccounts,
  passwordLogin,
  syntheticUser,
  syntheticMarketQuotes,
} from "./helpers";
import type { InvestmentAccount } from "../src/types/investments";
import type { FinancialAccount, SpendingReport } from "../src/types/models";

test("opening holdings, USD trades with CHF cash, lots and guarded corrections survive reload", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Account name").fill("Synthetic broker");
  await page.getByLabel("Account type").selectOption("INVESTMENT");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening cash balance").fill("1000");
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await page
    .getByRole("heading", { name: "Synthetic broker", exact: true })
    .getByRole("button")
    .click();
  await page.getByRole("link", { name: "Manage investment activity" }).click();
  await page.getByRole("button", { name: "Create security", exact: true }).click();
  await page.getByLabel("Security name").fill("Synthetic stock");
  await page.getByLabel("Ticker / symbol").fill("SYN");
  await page.getByLabel("Exchange", { exact: true }).fill("NASDAQ");
  await page.getByRole("button", { name: "Save security" }).click();
  await expect(page.getByText(/Security created/)).toBeVisible();
  const accounts = (await (
    await page.request.get("/api/v1/accounts")
  ).json()) as FinancialAccount[];
  const account = accounts.find((a) => a.name === "Synthetic broker")!;
  const load = async () =>
    (await (
      await page.request.get(`/api/v1/investments/accounts/${account.id}`)
    ).json()) as InvestmentAccount;
  const security = (await load()).securities[0];
  await page.getByRole("button", { name: "Add existing holding" }).click();
  await page.getByLabel("Security", { exact: true }).selectOption(security.id);
  await page.getByLabel("Quantity", { exact: true }).fill("2.5");
  await page.getByLabel("Holdings snapshot date").fill("2024-01-01");
  await page.getByLabel(/I confirmed this account balance/).check();
  await page.getByRole("button", { name: "Preview investment activity" }).click();
  await page.getByRole("button", { name: "Confirm existing holding" }).click();
  await expect(page.getByText(/Investment activity saved/)).toBeVisible();
  expect((await load()).cashBalance).toBe("1000");
  await page.getByRole("button", { name: "Record purchase", exact: true }).click();
  await page.getByLabel("Security", { exact: true }).selectOption(security.id);
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Execution unit price (USD)").fill("50");
  await page.getByLabel("Actual cash debit (CHF, excluding separately recorded costs)").fill("95");
  await page.getByLabel(/I confirmed this account balance/).check();
  await page.getByRole("button", { name: "Preview investment activity" }).click();
  await expect(page.getByText(/Execution gross: USD 100/)).toHaveText(/Cash movement: CHF -95/);
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await expect(page.getByText(/Investment activity saved/)).toBeVisible();
  expect((await load()).holdings[0].quantity).toBe("4.5");
  expect((await load()).cashBalance).toBe("905");
  await page.getByRole("button", { name: "Record sale", exact: true }).click();
  await page.getByLabel("Security", { exact: true }).selectOption(security.id);
  await page.getByLabel("Quantity", { exact: true }).fill("1");
  await page.getByLabel("Execution unit price (USD)").fill("60");
  await page.getByLabel("Actual cash credit (CHF, excluding separately recorded costs)").fill("55");
  await page.getByLabel(/I confirmed this account balance/).check();
  await page.getByRole("button", { name: "Preview investment activity" }).click();
  const allocations = page
    .getByRole("region", { name: "Investment preview" })
    .getByRole("textbox", { name: /Sell quantity from lot/ });
  await expect(allocations).toHaveCount(2);
  await allocations.nth(0).fill("0");
  await allocations.nth(1).fill("1");
  await expect(page.getByRole("button", { name: "Confirm sale" })).toBeDisabled();
  await page.getByRole("button", { name: "Rebuild investment preview" }).click();
  await page.getByRole("button", { name: "Confirm sale" }).click();
  await expect(page.getByText(/Investment activity saved/)).toBeVisible();
  expect((await load()).cashBalance).toBe("960");
  expect((await load()).holdings[0].quantity).toBe("3.5");
  await page.reload();
  await expect(page.getByText("CHF 960 uninvested cash")).toBeVisible();
  await page.getByRole("link", { name: "Cash activity", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit entry" })).toHaveCount(2);
  for (const button of await page.getByRole("button", { name: "Edit entry" }).all())
    await expect(button).toBeDisabled();
  const report = (await (await page.request.get("/api/v1/spending")).json()) as SpendingReport;
  expect(report.currencies).toHaveLength(0);
  await page.getByRole("link", { name: "Net worth", exact: true }).click();
  await expect(page.getByText(/Total incomplete — 1 security positions/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "CHF net worth", exact: true }).locator(".net-worth-total"),
  ).toHaveText("CHF 960.00");
  await page.goto(`/#/accounts/${account.id}/investments?activity=`);
  await page.getByRole("button", { name: "Investment activity", exact: true }).click();
  const buy = page.getByRole("row").filter({ hasText: "Synthetic stock · BUY" });
  await buy.getByRole("button", { name: "Review reversal / correction" }).click();
  await expect(page.getByText(/Reverse dependent sales first/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel reversal" }).click();
  const sale = page.getByRole("row").filter({ hasText: "Synthetic stock · SELL" });
  await sale.getByRole("button", { name: "Review reversal / correction" }).click();
  await page.getByRole("button", { name: "Confirm reversal", exact: true }).click();
  await expect(page.getByText(/Investment activity reversed/)).toBeVisible();
  await buy.getByRole("button", { name: "Review reversal / correction" }).click();
  await page.getByRole("button", { name: "Reverse and enter correction" }).click();
  await expect(page.getByText(/Original activity reversed/)).toBeVisible();
  await page.getByLabel("Actual cash debit (CHF, excluding separately recorded costs)").fill("90");
  await page.getByLabel(/I confirmed this account balance/).check();
  await page.getByRole("button", { name: "Preview investment activity" }).click();
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await expect(page.getByText(/Investment activity saved/)).toBeVisible();
  expect((await load()).cashBalance).toBe("910");
  expect((await load()).holdings[0].quantity).toBe("4.5");
  await syntheticMarketQuotes(email, security.id);
  await page.getByRole("link", { name: "Holdings overview" }).click();
  await expect(
    page.getByRole("region", { name: "Investment account value" }).getByText("CHF 1’315.00"),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /daily price trend/ })).toBeVisible();
  await page.route("**/api/v1/market-data/search?*", (route) =>
    route.fulfill({
      json: [{ symbol: "SYN", name: "Synthetic stock", exchange: "NASDAQ", type: "STOCK" }],
    }),
  );
  await page.route("**/api/v1/market-data/securities", (route) =>
    route.fulfill({ json: security, status: 201 }),
  );
  await page.getByRole("button", { name: "Add holding", exact: true }).click();
  await page.getByLabel("Find stock or ETF").fill("synthetic");
  await page.getByRole("button", { name: "Search online" }).click();
  await page.getByRole("button", { name: "Synthetic stock · SYN · NASDAQ · STOCK" }).click();
  await page.getByLabel("Shares to add").fill("0.5");
  await page.getByRole("button", { name: "Save holding" }).click();
  await expect(page.getByText(/Holding added. Cash is unchanged/)).toBeVisible();
  expect((await load()).cashBalance).toBe("910");
  expect((await load()).holdings[0].quantity).toBe("5");
  await expect(
    page.getByRole("region", { name: "Investment account value" }).getByText("CHF 1’360.00"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Investment account value" }).getByText("CHF 1’360.00"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cash activity / record costs" }).click();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.getByLabel("Amount (CHF)").fill("5");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic investment fee");
  await page.getByRole("button", { name: "Save activity", exact: true }).click();
  await expect(page.getByText("Synthetic investment fee", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Holdings and investment activity" }).click();
  await expect(
    page.getByRole("region", { name: "Investment account value" }).getByText("CHF 1’355.00"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Net worth", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "CHF net worth", exact: true }).locator(".net-worth-total"),
  ).toHaveText("CHF 1’355.00");
  await page.getByRole("link", { name: "Synthetic broker", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Holdings", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("investment-holdings.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
