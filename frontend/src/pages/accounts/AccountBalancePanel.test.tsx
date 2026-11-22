import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AccountBalancePanel } from "./AccountBalancePanel";
import { AccountDetail } from "./AccountDetail";
import { api, ApiError } from "../../services/api";
import { balanceFixture } from "../../test-fixtures/accountBalance";
import type { FinancialAccount } from "../../types/models";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      accountBalance: vi.fn(),
      account: vi.fn(),
      accounts: vi.fn(),
      categories: vi.fn(),
      activity: vi.fn(),
      saveActivity: vi.fn(),
    },
  };
});
const account: FinancialAccount = {
  id: "a",
  name: "Synthetic cash",
  type: "CASH",
  institution: null,
  currency: "CHF",
  openingBalance: "100",
  openingDate: "2020-01-01",
  active: true,
  createdAt: "2020-01-01T00:00:00Z",
  version: 0,
  hasActivity: false,
  currentBalance: "100",
  balanceAsOf: "2026-11-09",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.accountBalance).mockImplementation((_id, date, include, page = 0) =>
    Promise.resolve(
      balanceFixture({
        date,
        page,
        forecast: include
          ? { adjustment: "-25", balance: "75", complete: true, overdueCount: 0, reviews: [] }
          : null,
      }),
    ),
  );
  vi.mocked(api.account).mockResolvedValue(account);
  vi.mocked(api.accounts).mockResolvedValue([account]);
  vi.mocked(api.categories).mockResolvedValue({ items: [], starterSetAvailable: true });
  vi.mocked(api.activity).mockResolvedValue({ items: [], page: 0, hasMore: false });
});
it("defaults to the server business date and provides future shortcuts with optional separate forecasts", async () => {
  render(<AccountBalancePanel account={account} onExpired={vi.fn()} />);
  await screen.findByText("Recorded balance on 2026-11-09");
  expect(api.accountBalance).toHaveBeenLastCalledWith("a", "2026-11-09", false, 0);
  fireEvent.click(screen.getByRole("button", { name: "+7 days" }));
  await screen.findByText("Recorded balance on 2026-11-16");
  fireEvent.click(screen.getByRole("switch", { name: "Include expected transactions" }));
  expect(
    await screen.findByText("Projected balance including expected transactions"),
  ).toBeVisible();
  expect(api.accountBalance).toHaveBeenLastCalledWith("a", "2026-11-16", true, 0);
  expect(screen.getByText("CHF 75.00")).toBeVisible();
});
it("temporarily disables projections for past dates and preserves the switch choice", async () => {
  render(<AccountBalancePanel account={account} onExpired={vi.fn()} />);
  await screen.findByText("Recorded balance on 2026-11-09");
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText("Projected balance including expected transactions");
  fireEvent.change(screen.getByLabelText("Balance date"), { target: { value: "2026-11-08" } });
  await waitFor(() =>
    expect(api.accountBalance).toHaveBeenLastCalledWith("a", "2026-11-08", false, 0),
  );
  expect(screen.getByRole("switch")).toBeDisabled();
  expect(screen.getByRole("switch")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
  await waitFor(() =>
    expect(api.accountBalance).toHaveBeenLastCalledWith("a", "2026-11-10", true, 0),
  );
  expect(screen.getByRole("switch")).toBeEnabled();
});
it("keeps an in-flight calculation when the already selected Today shortcut is pressed", async () => {
  let resolve!: (value: ReturnType<typeof balanceFixture>) => void;
  vi.mocked(api.accountBalance).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<AccountBalancePanel account={account} onExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  resolve(balanceFixture());
  await screen.findByText("Recorded balance on 2026-11-09");
  expect(screen.queryByText("Calculating balance…")).not.toBeInTheDocument();
});
it("does not let an older response overwrite a newer selection", async () => {
  let resolveOld!: (value: ReturnType<typeof balanceFixture>) => void;
  vi.mocked(api.accountBalance).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  render(<AccountBalancePanel account={account} onExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
  await screen.findByText("Recorded balance on 2026-11-10");
  resolveOld(balanceFixture({ date: "2026-11-09", recordedBalance: "999" }));
  await waitFor(() => expect(screen.queryByText("CHF 999.00")).not.toBeInTheDocument());
  expect(screen.getByText("Recorded balance on 2026-11-10")).toBeVisible();
});
it("marks failed refreshes as outdated and supports retry and pre-opening states", async () => {
  render(<AccountBalancePanel account={account} onExpired={vi.fn()} />);
  await screen.findByText("Recorded balance on 2026-11-09");
  vi.mocked(api.accountBalance).mockRejectedValueOnce(new Error("Synthetic offline"));
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic offline");
  expect(screen.getByText(/Previous calculation shown/)).toBeVisible();
  vi.mocked(api.accountBalance).mockResolvedValueOnce(
    balanceFixture({
      date: "2026-11-10",
      available: false,
      recordedBalance: null,
      recordedChange: null,
      openingDate: "2027-01-01",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry balance" }));
  expect(await screen.findByText(/Balance unavailable before/)).toBeVisible();
});
it("shows review and overdue reminders, sources and independently paginated contributions", async () => {
  vi.mocked(api.accountBalance).mockImplementation((_id, date, include, page = 0) =>
    Promise.resolve(
      balanceFixture({
        date,
        page,
        hasMore: page === 0,
        entries: [
          {
            id: "scheduled",
            date,
            description: "Synthetic transfer",
            amount: "-10",
            source: "RECORDED",
            kind: "TRANSFER",
            operationId: "tx",
            expectationId: null,
          },
        ],
        forecast: include
          ? {
              adjustment: "0",
              balance: "100",
              complete: false,
              overdueCount: 2,
              reviews: [
                {
                  expectationId: "e",
                  name: "Synthetic rent",
                  month: "2026-11-01",
                  reason: "Needs review",
                },
              ],
            }
          : null,
      }),
    ),
  );
  render(<AccountBalancePanel account={account} onExpired={vi.fn()} />);
  await screen.findByText("Recorded balance on 2026-11-09");
  fireEvent.click(screen.getByRole("button", { name: "+30 days" }));
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText(/Projection incomplete: expected/);
  expect(screen.getByText(/2 overdue unrecorded/)).toBeVisible();
  fireEvent.click(screen.getByText("Balance breakdown"));
  expect(screen.getByText("Recorded (scheduled)")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next contributions" }));
  await waitFor(() =>
    expect(api.accountBalance).toHaveBeenLastCalledWith("a", "2026-12-09", true, 1),
  );
  expect(screen.getByText("Page 2")).toBeVisible();
});
it("refreshes after saving activity without resetting the chosen date", async () => {
  render(<AccountDetail id="a" onBack={vi.fn()} onExpired={vi.fn()} />);
  const panel = await screen.findByRole("region", { name: "Balance on date" });
  await within(panel).findByText("Recorded balance on 2026-11-09");
  fireEvent.click(within(panel).getByRole("button", { name: "+7 days" }));
  await screen.findByText("Recorded balance on 2026-11-16");
  const before = vi.mocked(api.accountBalance).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Description", { exact: true }), {
    target: { value: "Synthetic adjustment" },
  });
  vi.mocked(api.saveActivity).mockResolvedValue({} as Awaited<ReturnType<typeof api.saveActivity>>);
  vi.mocked(api.account).mockResolvedValue({ ...account, currentBalance: "90" });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(api.accountBalance).toHaveBeenCalledTimes(before + 1));
  expect(within(panel).getByLabelText("Balance date")).toHaveValue("2026-11-16");
});
it("expires unauthorized sessions and labels investment values as cash", async () => {
  vi.mocked(api.accountBalance).mockRejectedValue(new ApiError(401, "Expired"));
  const expire = vi.fn();
  render(<AccountBalancePanel account={{ ...account, type: "INVESTMENT" }} onExpired={expire} />);
  await waitFor(() => expect(expire).toHaveBeenCalled());
  expect(screen.getByText(/Security market values are excluded/)).toBeVisible();
});
