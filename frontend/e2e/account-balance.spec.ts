import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  enroll,
  openAccounts,
  expectCompactWorkspace,
} from "./helpers";
import { addBalanceDays } from "../src/utils/balanceDates";

test("chosen-date cash balances include scheduled activity and optionally expected items without double counting", async ({
  page,
}) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Account name").fill("Synthetic balance cash");
  await page.getByLabel("Account type").selectOption("CASH");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening balance", { exact: true }).fill("1000");
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await page.getByRole("button", { name: "Synthetic balance cash", exact: true }).click();
  const panel = page.getByRole("region", { name: "Balance on date", exact: true });
  const today = await panel.getByLabel("Balance date", { exact: true }).inputValue();
  const target = addBalanceDays(today, 7);
  await panel.getByRole("button", { name: "+7 days", exact: true }).click();
  await expect(panel.getByText(`Recorded balance on ${target}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.getByLabel("Amount (CHF)").fill("50");
  await page.getByLabel("Transaction date", { exact: true }).fill(addBalanceDays(today, 2));
  await page.getByLabel("Description", { exact: true }).fill("Synthetic scheduled bill");
  await page.getByRole("button", { name: "Save activity", exact: true }).click();
  await expect(
    panel.getByText(`Recorded balance on ${target}`, { exact: true }).locator(".."),
  ).toContainText("CHF 950.00");
  await expect(panel.getByLabel("Balance date", { exact: true })).toHaveValue(target);
  await page.getByRole("link", { name: "Expected", exact: true }).click();
  await page.getByLabel("Expected month").fill(target.slice(0, 7));
  await page.getByRole("button", { name: "Add recurring item", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Synthetic forecast bill");
  await page.getByLabel("Type", { exact: true }).selectOption("EXPENSE");
  await page
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "Synthetic balance cash · CHF" });
  await page.getByLabel("Monthly amount (CHF)").fill("100");
  await page.getByLabel("Day of month").fill(String(Number(target.slice(-2))));
  await page.getByLabel("First month", { exact: true }).fill(target.slice(0, 7));
  await page.getByLabel("Last month (optional)").fill(target.slice(0, 7));
  await page.getByRole("button", { name: "Save recurring item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Record Synthetic forecast bill", exact: true }),
  ).toBeVisible();
  async function inspectForecast(recorded: string, projected: string) {
    await page.getByRole("link", { name: "Accounts", exact: true }).click();
    await page.getByRole("button", { name: "Synthetic balance cash", exact: true }).click();
    await panel.getByLabel("Balance date", { exact: true }).fill(target);
    await panel.getByRole("switch", { name: "Include expected transactions", exact: true }).check();
    await expect(
      panel.getByText(`Recorded balance on ${target}`, { exact: true }).locator(".."),
    ).toContainText(`CHF ${recorded}`);
    await expect(
      panel
        .getByText("Projected balance including expected transactions", { exact: true })
        .locator(".."),
    ).toContainText(`CHF ${projected}`);
  }
  await inspectForecast("950.00", "850.00");
  await panel.getByText("Balance breakdown", { exact: true }).click();
  await expect(panel.getByText("Recorded (scheduled)", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Expected (estimate)", exact: true })).toBeVisible();
  for (const control of await panel
    .locator('button:visible,input:visible:not([type="checkbox"]),summary')
    .all())
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectCompactWorkspace(page);
  await page.getByRole("link", { name: "Expected", exact: true }).click();
  await page.getByLabel("Expected month").fill(target.slice(0, 7));
  await page.getByRole("button", { name: "Record Synthetic forecast bill", exact: true }).click();
  await page.getByLabel("Actual amount (CHF)").fill("110");
  await page.getByRole("button", { name: "Save actual transaction", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unlink Synthetic forecast bill", exact: true }),
  ).toBeVisible();
  await inspectForecast("840.00", "840.00");
});
