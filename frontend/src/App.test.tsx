import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { displayAmount } from "./App";
import { api, ApiError } from "./api";
import type { FinancialAccount } from "./api";

vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return { ...actual, api: { session: vi.fn(), login: vi.fn(), logout: vi.fn(), accounts: vi.fn(), createAccount: vi.fn(), security: vi.fn(), verifyMfa: vi.fn(), startMfa: vi.fn(), verifyEnrollment: vi.fn(), confirmMfa: vi.fn(), cancelMfa: vi.fn() } };
});
const session = { status: "AUTHENTICATED" as const, user: { id: "owner-1", email: "owner@example.test" } };
const account: FinancialAccount = { id: "account-1", name: "Everyday", type: "CHECKING", institution: null, currency: "CHF", openingBalance: "1234.56000000", openingDate: "2026-10-04", active: true, createdAt: "2026-10-04T00:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  window.location.hash = "";
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
    expect(api.createAccount).toHaveBeenCalledWith(expect.objectContaining({ openingAmount: "1234.56", currency: "CHF", balanceMeaning: "BALANCE" }));
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
    vi.mocked(api.createAccount).mockRejectedValue(new ApiError(400, "Check the account details.", { currency: "Invalid currency" }));
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
    expect(api.createAccount).toHaveBeenCalledWith(expect.objectContaining({ openingAmount: "400.12", balanceMeaning: "AMOUNT_OWED" }));
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
    expect(displayAmount("99999999999999999999.12345678")).toBe("99’999’999’999’999’999’999.12345678");
    expect(displayAmount("-1.01000000")).toBe("-1.01");
  });
});
