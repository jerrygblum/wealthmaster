import { randomUUID } from "node:crypto";
import pg from "pg";
import { test, expect } from "@playwright/test";
import { passwordLogin, password, enroll, signOut, expectCompactWorkspace } from "./helpers";

async function resetRegistrationFixture() {
  const url = process.env.DB_URL?.replace(/^jdbc:/, "");
  if (!url || !new URL(url).pathname.endsWith("_e2e"))
    throw new Error("Registration fixtures require a dedicated _e2e database.");
  const connection = new URL(url);
  connection.username = process.env.DB_USER ?? "";
  connection.password = process.env.DB_PASSWORD ?? "";
  const client = new pg.Client({ connectionString: connection.toString() });
  await client.connect();
  try {
    await client.query("DELETE FROM registration_invitations");
    await client.query("UPDATE registration_settings SET enabled=FALSE,version=0 WHERE id=1");
    const owner = "(SELECT id FROM app_users WHERE email='owner@example.test' AND role='OWNER')";
    for (const table of ["mfa_pending", "mfa_recovery_codes", "user_mfa"])
      await client.query(`DELETE FROM ${table} WHERE user_id=${owner}`);
    await client.query("DELETE FROM auth_attempt_limits");
  } finally {
    await client.end();
  }
}

test("owner controls invitation-only signup and new members complete required MFA", async ({
  page,
}) => {
  await resetRegistrationFixture();
  const status = await passwordLogin(page, "owner@example.test");
  if (status !== "MFA_SETUP_REQUIRED")
    await page.getByRole("link", { name: "Settings", exact: true }).click();
  const ownerMfa = await enroll(page);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const ownerAccount = `Synthetic owner ${randomUUID()}`;
  await page.getByLabel("Account name").fill(ownerAccount);
  await page.getByLabel("Currency", { exact: true }).fill("CHF");
  await page.getByLabel("Opening balance", { exact: true }).fill("100");
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("heading", { name: ownerAccount, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const enabled = page.getByLabel("Allow invited users to register");
  await expect(enabled).not.toBeChecked();
  const email = `synthetic.${randomUUID()}@example.test`;
  await page.getByLabel("Invite email").fill(email);
  await page.getByRole("button", { name: "Create invitation", exact: true }).focus();
  await page.keyboard.press("Enter");
  const code = await page.getByLabel("Invitation code", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Dismiss invitation code" }).click();
  await expect(page.getByLabel("Invitation code", { exact: true })).toHaveCount(0);
  await expectCompactWorkspace(page);
  await signOut(page);
  await expect(page.getByRole("link", { name: "Register with an invitation" })).toHaveCount(0);
  await page.goto("/#/register");
  await expect(page.getByText("Registration is disabled. Contact the owner.")).toBeVisible();
  await passwordLogin(page, "owner@example.test");
  await page.getByLabel("Verification method").selectOption("RECOVERY");
  await page.getByLabel("Recovery code", { exact: true }).fill(ownerMfa.codes[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(enabled).not.toBeChecked();
  const enabling = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/v1/registration" && r.request().method() === "PUT",
  );
  // A controlled checkbox settles through React and the save request. Assert
  // its state after saving rather than check()'s immediate native postcondition.
  await enabled.click();
  expect((await enabling).status()).toBe(200);
  await expect(enabled).toBeChecked();
  await page.getByRole("button", { name: `Replace invitation for ${email}` }).click();
  const replacement = await page.getByLabel("Invitation code", { exact: true }).inputValue();
  expect(replacement).not.toBe(code);
  await signOut(page);
  await page.getByRole("link", { name: "Register with an invitation" }).click();
  // Sign-in and registration both label their email field "Email". Wait for
  // the destination page so a fast runner cannot fill the outgoing form.
  await expect(
    page.getByRole("heading", { name: "Create your account", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Invitation code", { exact: true }).fill(code);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  const rejectedSignup = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/v1/auth/register" && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await rejectedSignup).status()).toBe(403);
  await expect(page.getByText(/Unable to register with these details/)).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Invitation code", { exact: true }).fill(replacement);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const signup = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/v1/auth/register" && r.status() === 201,
  );
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const session = (await (await signup).json()) as { status: string; user: { role: string } };
  expect(session.user.role).toBe("MEMBER");
  let memberCodes: string[] = [];
  if ((process.env.E2E_PROFILE ?? "dev") === "prod") {
    expect(session.status).toBe("MFA_SETUP_REQUIRED");
    expect((await page.request.get("/api/v1/accounts")).status()).toBe(403);
    memberCodes = (await enroll(page)).codes;
  } else {
    expect(session.status).toBe("AUTHENTICATED");
    await expect(page.getByRole("heading", { name: "Net worth", exact: true })).toBeVisible();
  }
  expect((await page.request.get("/api/v1/registration")).status()).toBe(403);
  expect(await (await page.request.get("/api/v1/accounts")).json()).toEqual([]);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration", exact: true })).toHaveCount(0);
  await expectCompactWorkspace(page);
  await signOut(page);
  await passwordLogin(page, "owner@example.test");
  await page.getByLabel("Verification method").selectOption("RECOVERY");
  await page.getByLabel("Recovery code", { exact: true }).fill(ownerMfa.codes[1]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(enabled).toBeChecked();
  const disabling = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/v1/registration" && r.request().method() === "PUT",
  );
  await enabled.click();
  expect((await disabling).status()).toBe(200);
  await expect(enabled).not.toBeChecked();
  await signOut(page);
  const existing = await passwordLogin(page, email);
  if (existing === "MFA_REQUIRED") {
    await page.getByLabel("Verification method").selectOption("RECOVERY");
    await page.getByLabel("Recovery code", { exact: true }).fill(memberCodes[0]);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await expect(page.getByRole("navigation")).toBeVisible();
  expect((await page.request.get("/api/v1/accounts")).status()).toBe(200);
});
