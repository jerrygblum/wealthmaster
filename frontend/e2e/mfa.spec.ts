import { test, expect } from "@playwright/test";
import {
  syntheticUser,
  passwordLogin,
  password,
  enroll,
  readCodes,
  signOut,
  recoveryLogin,
  authenticatorCode,
} from "./helpers";

test("enrollment, recovery, authenticator replacement, regeneration, and TOTP login", async ({
  page,
}, testInfo) => {
  const email = await syntheticUser();
  const status = await passwordLogin(page, email);
  if (status === "MFA_SETUP_REQUIRED") {
    expect((await page.request.get("/api/v1/accounts")).status()).toBe(403);
    await expect(page.getByText(/before accessing your financial accounts/)).toBeVisible();
  } else {
    expect(status).toBe("AUTHENTICATED");
    await page.getByRole("link", { name: "Settings", exact: true }).click();
  }
  const initial = await enroll(page);
  await signOut(page);
  expect(await passwordLogin(page, email)).toBe("MFA_REQUIRED");
  expect((await page.request.get("/api/v1/accounts")).status()).toBe(403);
  expect((await page.request.get("/api/v1/users/me/security")).status()).toBe(403);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Verify your sign-in" })).toBeVisible();
  await page.getByLabel("Verification method").selectOption("RECOVERY");
  await page.getByLabel("Recovery code", { exact: true }).fill(initial.codes[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("9 recovery codes remaining.")).toBeVisible();
  await page.getByRole("button", { name: "Replace authenticator" }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Continue setup" }).click();
  const replacementSecret = await page.locator(".setup-key").innerText();
  expect(replacementSecret).not.toBe(initial.secret);
  await page.getByLabel("Code from your authenticator").fill(authenticatorCode(replacementSecret));
  await page.getByRole("button", { name: "Verify authenticator" }).click();
  const replacementCodes = await readCodes(page);
  await page.getByLabel("I saved my recovery codes").check();
  await page.getByRole("button", { name: "Confirm security change" }).click();
  await expect(page.getByText("10 recovery codes remaining.")).toBeVisible();
  await signOut(page);
  await recoveryLogin(page, email, replacementCodes[0]);
  await page.getByRole("button", { name: "Generate new recovery codes" }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Continue setup" }).click();
  const regeneratedCodes = await readCodes(page);
  await page.getByLabel("I saved my recovery codes").check();
  await page.getByRole("button", { name: "Confirm security change" }).click();
  await expect(page.getByText("10 recovery codes remaining.")).toBeVisible();
  await signOut(page);
  expect(await passwordLogin(page, email)).toBe("MFA_REQUIRED");
  await page.getByLabel("Verification method").selectOption("RECOVERY");
  await page.getByLabel("Recovery code", { exact: true }).fill(replacementCodes[1]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid or already-used recovery code");
  await page.getByLabel("Recovery code", { exact: true }).fill(regeneratedCodes[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("9 recovery codes remaining.")).toBeVisible();
  await signOut(page);
  expect(await passwordLogin(page, email)).toBe("MFA_REQUIRED");
  // Simulate an authenticator one period ahead, within the supported clock tolerance.
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(authenticatorCode(replacementSecret, 30));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Net worth", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("security.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await signOut(page);
});
