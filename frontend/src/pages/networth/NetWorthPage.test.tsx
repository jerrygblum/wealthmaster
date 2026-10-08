import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { CurrentNetWorth } from "../../types/models";
import App from "../application/App";
import { NetWorthPage } from "./NetWorthPage";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      categories: vi.fn(),
      currentNetWorth: vi.fn(),
      session: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      accounts: vi.fn(),
      account: vi.fn(),
      activity: vi.fn(),
      security: vi.fn(),
    },
  };
});
const user = { id: "synthetic-owner", email: "owner@example.test" };
const empty: CurrentNetWorth = {
  balanceAsOf: "2026-10-04",
  calculatedAt: "2026-10-04T12:00:00Z",
  currencies: [],
  accounts: [],
  excludedFutureAccounts: [],
};
const report: CurrentNetWorth = {
  ...empty,
  currencies: [
    {
      currency: "CHF",
      assets: "200000000000000000018.24691356",
      liabilities: "150.00000001",
      netWorth: "199999999999999999868.24691355",
      byAccountType: [
        {
          type: "CHECKING",
          assets: "200000000000000000018.24691356",
          liabilities: "150.00000001",
          netWorth: "199999999999999999868.24691355",
        },
      ],
    },
  ],
  accounts: [
    {
      id: "a",
      name: "Synthetic archived",
      type: "INVESTMENT",
      currency: "CHF",
      active: false,
      currentBalance: "-150.00000001",
    },
  ],
  excludedFutureAccounts: [
    {
      id: "b",
      name: "Synthetic future",
      type: "SAVINGS",
      currency: "EUR",
      active: true,
      openingDate: "2026-10-05",
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.categories).mockResolvedValue({ items: [], starterSetAvailable: true });
  window.location.hash = "";
  vi.mocked(api.currentNetWorth).mockResolvedValue(empty);
  vi.mocked(api.accounts).mockResolvedValue([]);
  vi.mocked(api.session).mockRejectedValue(new ApiError(401, "Please sign in."));
});
it("renders exact totals, signed contributions, archived status and excluded future accounts", async () => {
  vi.mocked(api.currentNetWorth).mockResolvedValue(report);
  render(<NetWorthPage user={user} onExpired={() => {}} />);
  await screen.findByText("CHF 199’999’999’999’999’999’868.25");
  expect(screen.getByText("CHF 150.00")).toBeVisible();
  expect(screen.getByText("Archived · included in totals")).toBeVisible();
  expect(screen.getByRole("link", { name: "Synthetic archived" })).toHaveAttribute(
    "href",
    "#/accounts/a",
  );
  expect(screen.getByRole("link", { name: "Synthetic future" })).toHaveAttribute(
    "href",
    "#/accounts/b",
  );
  expect(screen.getByText(/Opens/)).toHaveTextContent("2026-10-05");
});
it("shows loading without fabricated zero totals, then handles an empty report", async () => {
  let resolve!: (value: CurrentNetWorth) => void;
  vi.mocked(api.currentNetWorth).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<NetWorthPage user={user} onExpired={() => {}} />);
  expect(screen.getByRole("status")).toHaveTextContent("Calculating");
  expect(screen.queryByText("Assets")).not.toBeInTheDocument();
  resolve(empty);
  await screen.findByText("Start with your first account");
});
it("marks failed refreshes as previous calculations and retries", async () => {
  vi.mocked(api.currentNetWorth)
    .mockResolvedValueOnce(report)
    .mockRejectedValueOnce(new ApiError(0, "Disconnected"))
    .mockResolvedValueOnce(empty);
  render(<NetWorthPage user={user} onExpired={() => {}} />);
  await screen.findByText("Account contributions");
  fireEvent.click(screen.getByRole("button", { name: "Refresh net worth" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("previous calculation");
  fireEvent.click(screen.getByText("Try again"));
  await screen.findByText("Start with your first account");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("handles future-only reports and expired sessions", async () => {
  vi.mocked(api.currentNetWorth)
    .mockResolvedValueOnce({ ...empty, excludedFutureAccounts: report.excludedFutureAccounts })
    .mockRejectedValueOnce(new ApiError(401, "Expired"));
  const expired = vi.fn();
  render(<NetWorthPage user={user} onExpired={expired} />);
  await screen.findByText("No accounts are open yet");
  fireEvent.click(screen.getByRole("button", { name: "Refresh net worth" }));
  await waitFor(() => expect(expired).toHaveBeenCalled());
});
it("defaults a restored session to net worth and reloads on re-entry", async () => {
  vi.mocked(api.session).mockResolvedValue({ status: "AUTHENTICATED", user });
  render(<App />);
  await screen.findByRole("heading", { name: "Net worth" });
  await screen.findByText("Start with your first account");
  fireEvent.click(screen.getByRole("link", { name: "Accounts" }));
  await screen.findByRole("heading", { name: "Accounts" });
  fireEvent.click(screen.getByRole("link", { name: "Net worth" }));
  await screen.findByText("Start with your first account");
  expect(api.currentNetWorth).toHaveBeenCalledTimes(2);
});
it("preserves an explicit account deep link", async () => {
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  window.location.hash = `#/accounts/${id}`;
  vi.mocked(api.session).mockResolvedValue({ status: "AUTHENTICATED", user });
  vi.mocked(api.account).mockResolvedValue({
    id,
    name: "Synthetic bank",
    type: "CHECKING",
    currency: "CHF",
    currentBalance: "10",
    openingBalance: "10",
    openingDate: "2020-01-01",
    active: true,
    institution: null,
    createdAt: "",
    version: 0,
    hasActivity: false,
  });
  vi.mocked(api.activity).mockResolvedValue({ items: [], page: 0, hasMore: false });
  render(<App />);
  await screen.findByRole("heading", { name: "Synthetic bank" });
  expect(api.currentNetWorth).not.toHaveBeenCalled();
});
it("resets the destination on intentional logout and lands an ordinary login on net worth", async () => {
  window.location.hash = "#/accounts";
  vi.mocked(api.session).mockResolvedValue({ status: "AUTHENTICATED", user });
  vi.mocked(api.logout).mockResolvedValue();
  vi.mocked(api.login).mockResolvedValue({ status: "AUTHENTICATED", user });
  render(<App />);
  await screen.findByRole("heading", { name: "Accounts" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Welcome back" });
  expect(window.location.hash).toBe("#/net-worth");
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Start with your first account");
});
it("preserves the recovery-login redirect to settings", async () => {
  vi.mocked(api.login).mockResolvedValue({ status: "AUTHENTICATED", user, recoveryUsed: true });
  vi.mocked(api.security).mockResolvedValue({
    enabled: true,
    required: true,
    enabledAt: "2026-10-04T00:00:00Z",
    recoveryCodesRemaining: 9,
    pendingOperation: null,
  });
  render(<App />);
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Settings" });
  expect(api.currentNetWorth).not.toHaveBeenCalled();
});

it("reloads net worth when returning after activity changes in another tab", async () => {
  render(<NetWorthPage user={user} onExpired={() => {}} />);
  await waitFor(() => expect(api.currentNetWorth).toHaveBeenCalledTimes(1));
  vi.mocked(api.currentNetWorth).mockResolvedValue(report);
  fireEvent.focus(window);
  await screen.findByText("CHF 199’999’999’999’999’999’868.25");
  expect(api.currentNetWorth).toHaveBeenCalledTimes(2);
});
