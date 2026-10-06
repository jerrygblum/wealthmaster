import { test, expect } from "@playwright/test";
import { syntheticUser, passwordLogin, enroll, openAccounts } from "./helpers";

test("net worth is the default, separates currencies, and follows account activity", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await expect(page.getByRole("heading", { name: "Net worth", exact: true })).toBeVisible();
  await expect(page.getByText("Start with your first account")).toBeVisible();
  await openAccounts(page);
  for (const fixture of [
    {
      name: "Synthetic bank",
      type: "CHECKING",
      currency: "CHF",
      amount: "1000.12345678",
      date: "2020-01-01",
    },
    {
      name: "Synthetic card",
      type: "CREDIT_CARD",
      currency: "CHF",
      amount: "100",
      date: "2020-01-01",
    },
    {
      name: "Synthetic broker",
      type: "INVESTMENT",
      currency: "EUR",
      amount: "20.00000001",
      date: "2020-01-01",
    },
    {
      name: "Synthetic future",
      type: "SAVINGS",
      currency: "USD",
      amount: "999",
      date: "2099-01-01",
    },
  ]) {
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByLabel("Account name").fill(fixture.name);
    await page.getByLabel("Account type").selectOption(fixture.type);
    await page.getByLabel("Currency", { exact: true }).fill(fixture.currency);
    await page
      .getByLabel(
        fixture.type === "CREDIT_CARD"
          ? "Opening amount owed"
          : fixture.type === "INVESTMENT"
            ? "Opening cash balance"
            : "Opening balance",
        { exact: true },
      )
      .fill(fixture.amount);
    await page.getByLabel("Opening date").fill(fixture.date);
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await expect(page.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();
  }
  const broker = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Synthetic broker", exact: true }) });
  await broker.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("link", { name: "Net worth", exact: true }).click();
  const chf = page.getByRole("region", { name: "CHF net worth", exact: true });
  await expect(chf.locator(".net-worth-total")).toHaveText("CHF 900.12");
  await expect(
    page.getByRole("region", { name: "EUR net worth", exact: true }).locator(".net-worth-total"),
  ).toHaveText("EUR 20.00");
  await expect(page.getByRole("region", { name: "USD net worth", exact: true })).toHaveCount(0);
  await expect(page.getByText("Archived · included in totals")).toBeVisible();
  await expect(page.getByText(/Excluded from current totals/)).toBeVisible();
  await chf.getByText("Breakdown by account type").click();
  await expect(chf.getByText("Credit card", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Synthetic bank", exact: true }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Amount (CHF)").fill("10.00000001");
  await page.getByLabel("Description", { exact: true }).fill("Synthetic cost");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic cost", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Net worth", exact: true }).click();
  await expect(chf.locator(".net-worth-total")).toHaveText("CHF 890.12");
  await page.reload();
  await expect(chf.locator(".net-worth-total")).toHaveText("CHF 890.12");
  await page.getByRole("button", { name: "Refresh net worth" }).click();
  await expect(chf.locator(".net-worth-total")).toHaveText("CHF 890.12");
  await page.screenshot({ path: testInfo.outputPath("net-worth.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
