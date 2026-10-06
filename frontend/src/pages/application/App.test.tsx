import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { FinancialAccount } from "../../types/models";
import { displayAmount } from "../../utils/accountPresentation";
import App from "./App";

vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      spending: vi.fn(),
      session: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      accounts: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      restoreAccount: vi.fn(),
      deleteAccount: vi.fn(),
      security: vi.fn(),
      verifyMfa: vi.fn(),
      startMfa: vi.fn(),
      verifyEnrollment: vi.fn(),
      confirmMfa: vi.fn(),
      cancelMfa: vi.fn(),
    },
  };
});
const session = {
  status: "AUTHENTICATED" as const,
  user: { id: "owner-1", email: "owner@example.test" },
};
const account: FinancialAccount = {
  id: "account-1",
  name: "Everyday",
  type: "CHECKING",
  institution: null,
  currency: "CHF",
  openingBalance: "1234.56000000",
  openingDate: "2026-10-04",
  active: true,
  version: 0,
  hasActivity: false,
  createdAt: "2026-10-04T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  window.location.hash = "#/accounts";
  vi.mocked(api.session).mockRejectedValue(new ApiError(401, "Please sign in."));
  vi.mocked(api.accounts).mockResolvedValue([]);
});
async function signIn() {
  render(<App />);
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}
describe("workspace", () => {
  it("logs in, creates a persisted account, and logs out", async () => {
    vi.mocked(api.login).mockResolvedValue(session);
    vi.mocked(api.createAccount).mockResolvedValue(account);
    vi.mocked(api.logout).mockResolvedValue();
    await signIn();
    await screen.findByRole("heading", { name: "Your first account starts here" });
    fireEvent.click(screen.getByRole("button", { name: "Create your first account" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Everyday" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "CHF" } });
    fireEvent.change(screen.getByLabelText("Opening balance"), { target: { value: "1234.56" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await screen.findByRole("heading", { name: "Everyday" });
    expect(api.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        openingAmount: "1234.56",
        currency: "CHF",
        balanceMeaning: "BALANCE",
      }),
    );
    expect(screen.getByText("CHF 1’234.56")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("heading", { name: "Welcome back" });
  });
  it("restores a session and lists only returned accounts", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.accounts).mockResolvedValue([account]);
    render(<App />);
    await screen.findByRole("heading", { name: "Everyday" });
    expect(api.login).not.toHaveBeenCalled();
  });
  it("shows an invalid-login error and clears the password", async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, "Invalid email or password."));
    await signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
  it("handles connection failures with retry", async () => {
    vi.mocked(api.session).mockRejectedValueOnce(new ApiError(0, "Unable to reach Wealth Master."));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Welcome back" });
  });
  it("keeps account details after validation failures", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.createAccount).mockRejectedValue(
      new ApiError(400, "Check the account details.", { currency: "Invalid currency" }),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Your first account starts here" });
    fireEvent.click(screen.getByRole("button", { name: "Create your first account" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "ZZZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await screen.findByText("Invalid currency");
    expect(screen.getByLabelText("Account name")).toHaveValue("Test");
    expect(screen.getByLabelText("Currency")).toHaveAttribute("aria-invalid", "true");
  });
  it("uses positive debt and returns to login when a session expires", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.createAccount).mockRejectedValue(new ApiError(401, "Please sign in."));
    render(<App />);
    await screen.findByRole("heading", { name: "Your first account starts here" });
    fireEvent.click(screen.getByRole("button", { name: "Create your first account" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Card" } });
    fireEvent.change(screen.getByLabelText("Account type"), { target: { value: "CREDIT_CARD" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "CHF" } });
    fireEvent.change(screen.getByLabelText("Opening amount owed"), { target: { value: "400.12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(screen.getByRole("status")).toHaveTextContent("session expired");
    expect(api.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ openingAmount: "400.12", balanceMeaning: "AMOUNT_OWED" }),
    );
  });
  it("does not grant workspace access for a future MFA challenge", async () => {
    vi.mocked(api.login).mockResolvedValue({ status: "MFA_REQUIRED" });
    await signIn();
    await screen.findByRole("heading", { name: "Verify your sign-in" });
    expect(api.accounts).not.toHaveBeenCalled();
  });
  it("disables login while the request is pending", async () => {
    vi.mocked(api.login).mockImplementation(() => new Promise(() => {}));
    await signIn();
    await waitFor(() => expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled());
  });
  it("formats decimal strings without losing precision", () => {
    expect(displayAmount("99999999999999999999.12345678")).toBe(
      "99’999’999’999’999’999’999.12345678",
    );
    expect(displayAmount("-1.01000000")).toBe("-1.01");
  });

  it("prefills editing without losing precision, preserves amounts on type changes, and cancels", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.accounts).mockResolvedValue([
      { ...account, openingBalance: "-99999999999999999999.12345678" },
    ]);
    render(<App />);
    await screen.findByRole("heading", { name: "Everyday" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Opening balance")).toHaveValue("-99999999999999999999.12345678");
    fireEvent.change(screen.getByLabelText("Account type"), { target: { value: "CREDIT_CARD" } });
    expect(screen.getByLabelText("Opening amount owed")).toHaveValue(
      "99999999999999999999.12345678",
    );
    fireEvent.change(screen.getByLabelText("Account type"), { target: { value: "CHECKING" } });
    expect(screen.getByLabelText("Opening balance")).toHaveValue("-99999999999999999999.12345678");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Edit account" })).not.toBeInTheDocument(),
    );
    expect(api.updateAccount).not.toHaveBeenCalled();
  });
  it("saves edits, archives, restores, and confirms deletion", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.accounts).mockResolvedValue([account]);
    const changed = { ...account, name: "Renamed", version: 1 };
    vi.mocked(api.updateAccount).mockResolvedValue(changed);
    vi.mocked(api.archiveAccount).mockResolvedValue({ ...changed, active: false, version: 2 });
    vi.mocked(api.restoreAccount).mockResolvedValue({ ...changed, version: 3 });
    vi.mocked(api.deleteAccount).mockResolvedValue();
    render(<App />);
    await screen.findByRole("heading", { name: "Everyday" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await screen.findByRole("heading", { name: "Renamed" });
    expect(api.updateAccount).toHaveBeenCalledWith(
      account,
      expect.objectContaining({ openingAmount: account.openingBalance }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await screen.findByRole("heading", { name: "No active accounts" });
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    await screen.findByRole("heading", { name: "Renamed" });
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await screen.findByRole("heading", { name: "No archived accounts" });
    fireEvent.click(screen.getByRole("button", { name: "Active accounts" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await screen.findByRole("heading", { name: "Your first account starts here" });
    expect(api.deleteAccount).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
  });
  it("locks financial fields and deletion when activity exists", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.accounts).mockResolvedValue([{ ...account, hasActivity: true }]);
    render(<App />);
    await screen.findByRole("heading", { name: "Everyday" });
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    for (const label of ["Account type", "Currency", "Opening balance", "Opening date"])
      expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByLabelText("Account name")).not.toBeDisabled();
  });
  it("keeps edits on failure and reloads after cancelling a stale edit", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.accounts).mockResolvedValue([account]);
    vi.mocked(api.updateAccount).mockRejectedValue(
      new ApiError(412, "This account changed. Reload accounts and try again."),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Everyday" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Unsaved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This account changed");
    expect(screen.getByLabelText("Account name")).toHaveValue("Unsaved");
    expect(screen.getByRole("button", { name: "Save account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(api.accounts).toHaveBeenCalledTimes(2));
  });
  it("shows deletion errors and lets a stale deletion reload", async () => {
    vi.mocked(api.session).mockResolvedValue(session);
    vi.mocked(api.accounts).mockResolvedValue([account]);
    vi.mocked(api.deleteAccount).mockRejectedValue(new ApiError(412, "This account changed."));
    render(<App />);
    await screen.findByRole("heading", { name: "Everyday" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This account changed");
    expect(screen.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload accounts" }));
    await waitFor(() => expect(api.accounts).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Confirm deletion" })).not.toBeInTheDocument();
  });
});

it.each(["#/spending", "#/planning"])("opens Spending for %s", async (hash) => {
  window.location.hash = hash;
  vi.mocked(api.session).mockResolvedValue(session);
  vi.mocked(api.spending).mockResolvedValue({
    periodType: "MONTH",
    periodStart: "2026-10-01",
    categories: [],
    groups: [],
    currencies: [],
    limits: [],
    businessDate: "2026-10-05",
    settings: [],
  });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Spending" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Spending" })).toHaveAttribute("href", "#/spending");
  expect(screen.getByRole("link", { name: "Spending" })).toHaveAttribute("aria-current", "page");
});
