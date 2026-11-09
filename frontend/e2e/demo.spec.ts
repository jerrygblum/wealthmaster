import { test, expect } from "@playwright/test";
test.skip(process.env.E2E_DEMO !== "true", "Requires the separate synthetic demo deployment.");
test("anonymous visitors share finance edits while administrative and external actions stay unavailable", async ({
  page,
  browser,
}, testInfo) => {
  const storagePath = `${process.env.E2E_DEMO_STORAGE_DIR ?? "test-results"}/demo-session-${testInfo.project.name}.json`;
  if (process.env.E2E_DEMO_AFTER_RESET === "true") {
    const old = await browser.newContext({ ignoreHTTPSErrors: true, storageState: storagePath });
    try {
      expect(
        (await old.request.get(`${process.env.E2E_BASE_URL}/api/v1/auth/session`)).status(),
      ).toBe(401);
    } finally {
      await old.close();
    }
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Try the shared demo" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  await expect(page.getByText("Shared editable demo.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Migration", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  const label = `Synthetic visitor account ${Date.now()}`;
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Account name").fill(label);
  await page.getByLabel("Account type").selectOption("CASH");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening balance", { exact: true }).fill("125.50");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const viewer = await other.newPage();
    await viewer.goto(process.env.E2E_BASE_URL!);
    await viewer.getByRole("button", { name: "Try demo", exact: true }).click();
    await viewer.getByRole("link", { name: "Accounts", exact: true }).click();
    await expect(viewer.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await page.getByRole("button", { name: label, exact: true }).click();
    const balancePanel = page.getByRole("region", { name: "Balance on date", exact: true });
    await balancePanel.getByRole("button", { name: "+7 days", exact: true }).click();
    await balancePanel
      .getByRole("switch", { name: "Include expected transactions", exact: true })
      .check();
    await expect(
      balancePanel
        .getByText("Projected balance including expected transactions", { exact: true })
        .locator(".."),
    ).toContainText("CHF 125.50");
    await page.getByRole("link", { name: "Net worth", exact: true }).click();
    await page.getByRole("link", { name: "Investment portfolio", exact: true }).click();
    await expect(page.getByRole("button", { name: "Refresh prices", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /online listing/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Update NAV / history", exact: true }).click();
    await page.getByLabel(/Published NAV per unit/).fill("110.123456789012");
    await page.getByLabel("NAV valuation date").fill("2020-01-01");
    await page.getByRole("button", { name: "Save NAV", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "CHF 110.123456789012", exact: true }).first(),
    ).toBeVisible();
    const denied = await page.request.get("/api/v1/users/me/security");
    expect(denied.status()).toBe(403);
    const csrf = (await (await page.request.get("/api/v1/auth/csrf")).json()) as {
      headerName: string;
      token: string;
    };
    const blocked = await page.request.post(
      "/api/v1/market-data/accounts/11111111-1111-4111-8111-111111111111/refresh",
      { headers: { [csrf.headerName]: csrf.token } },
    );
    expect(blocked.status()).toBe(403);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Try demo", exact: true })).toBeVisible();
    await viewer.reload();
    await expect(viewer.getByRole("heading", { name: label, exact: true })).toBeVisible();
  } finally {
    await other.storageState({ path: storagePath });
    await other.close();
  }
});
