import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  enroll,
  openAccounts,
  expectCompactWorkspace,
} from "./helpers";

test("create, edit, archive, restore, delete an account and log out", async ({
  page,
}, testInfo) => {
  const name = `Synthetic savings ${testInfo.project.name} ${Date.now()}`;
  const email = await syntheticUser();
  const status = await passwordLogin(page, email);
  if (status === "MFA_SETUP_REQUIRED") {
    await enroll(page);
  }
  await openAccounts(page);
  await expectCompactWorkspace(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Account name").fill(name);
  await page.getByLabel("Account type").selectOption("SAVINGS");
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening balance", { exact: true }).fill("1234.56");
  await page.getByLabel("Opening date").fill("2026-10-04");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.reload();
  const account = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(account).toContainText("CHF 1’234.56");
  await account.getByRole("button", { name, exact: true }).click();
  await expect(page.getByText(/^Opening balance:/)).toContainText("2026-10-04");
  await expectCompactWorkspace(page);
  await page.getByRole("button", { name: "Back to accounts" }).click();
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  const edit = account.getByRole("button", { name: "Edit", exact: true });
  await expect(edit).toHaveAttribute("title", `Edit ${name}`);
  const actionSize = page.viewportSize()!.width <= 720 ? 40 : 32;
  // Returning from account details can replace the list. Re-resolve the button
  // until its rendered geometry settles instead of measuring a detached node.
  await expect
    .poll(() => edit.boundingBox())
    .toMatchObject({ width: actionSize, height: actionSize });
  await edit.focus();
  await page.keyboard.press("Enter");
  const changedName = `${name} updated`;
  await page.getByLabel("Account name").fill(changedName);
  await page.getByLabel("Opening balance", { exact: true }).fill("99999999999999999999.12345678");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("heading", { name: changedName, exact: true })).toBeVisible();
  await page.reload();
  const changed = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: changedName, exact: true }) });
  await expect(changed).toContainText("CHF 99’999’999’999’999’999’999.12");
  await expectCompactWorkspace(page);
  await changed.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: changedName, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Archived accounts" }).click();
  await expect(changed).toContainText("Archived");
  await page.reload();
  await page.getByRole("button", { name: "Archived accounts" }).click();
  await changed.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No archived accounts" })).toBeVisible();
  await page.getByRole("button", { name: "Active accounts" }).click();
  await expect(changed).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("accounts.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await changed.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(changed).toBeVisible();
  await changed.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByRole("heading", { name: "Your first account starts here" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your first account starts here" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect((await page.request.get("/api/v1/accounts")).status()).toBe(401);
});

test("account order and colors survive reloads", async ({ page }) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);
  await openAccounts(page);
  for (const name of ["Synthetic daily", "Synthetic savings"]) {
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByLabel("Account name").fill(name);
    await page.getByLabel("Currency", { exact: true }).fill("CHF");
    await page.getByLabel("Opening balance", { exact: true }).fill("100");
    await page.getByLabel("Opening date").fill("2026-10-04");
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("article").first()).toContainText("Synthetic savings");
  await page.getByRole("button", { name: "Card settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Account card settings" });
  const move = dialog.getByRole("button", { name: "Move Synthetic daily up" });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("listitem").first()).toContainText("Synthetic daily");
  await dialog.getByLabel("Hex color for Synthetic daily", { exact: true }).fill("#a637c8");
  await dialog.getByRole("combobox", { name: "Bank mark for Synthetic daily" }).selectOption("UBS");
  await dialog
    .getByRole("button", { name: "Save appearance for Synthetic daily", exact: true })
    .click();
  await expect(
    dialog.getByText("Synthetic daily appearance saved.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const card = page.getByRole("article").first();
  await expect(card).toContainText("Synthetic daily");
  expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    "rgb(255, 255, 255)",
  );
  await page.reload();
  await expect(card).toContainText("Synthetic daily");
  await expect(card.getByRole("img", { name: "UBS bank mark" })).toBeVisible();
  await page.getByRole("button", { name: "Card settings", exact: true }).click();
  await expect(dialog.getByLabel("Hex color for Synthetic daily", { exact: true })).toHaveValue(
    "#a637c8",
  );
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const label of ["Move Synthetic daily down", "Save appearance for Synthetic daily"]) {
    expect(
      (await dialog.getByRole("button", { name: label, exact: true }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
  }
  // Custom files are resized locally, then persisted with the account.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0055aa";
    ctx.fillRect(0, 0, 24, 24);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("Upload logo for Synthetic daily", { exact: true }).setInputFiles({
    name: "synthetic-bank.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await dialog
    .getByRole("button", { name: "Save appearance for Synthetic daily", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Save appearance for Synthetic daily", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(card.getByAltText("Custom account logo")).toBeVisible();
  await page.getByRole("button", { name: "Card settings", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Card settings", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await card.getByRole("button", { name: "View details for Synthetic daily", exact: true }).click();
  await expect(page.getByRole("region", { name: "Balance on date", exact: true })).toBeVisible();
});
