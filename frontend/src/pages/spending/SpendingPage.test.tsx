import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { SpendingReport } from "../../types/models";
import { SpendingPage } from "./SpendingPage";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, spending: vi.fn(), spendingActivity: vi.fn() } };
});
const cat = {
  id: "food",
  name: "Food",
  type: "SPENDING" as const,
  parentId: null,
  active: false,
  available: false,
  hasActivity: true,
  hasChildren: true,
  createdAt: "",
  version: 1,
};
const amounts = { expenses: "10.12345678", refunds: "20.00000000", netSpending: "-9.87654322" };
const report: SpendingReport = {
  periodType: "MONTH",
  periodStart: "2026-10-01",
  categories: [
    cat,
    { ...cat, id: "child", name: "Groceries", parentId: "food" },
    { ...cat, id: "empty", name: "Empty", available: true, active: true },
  ],
  groups: [
    {
      categoryId: "food",
      currency: "CHF",
      direct: { expenses: "0", refunds: "0", netSpending: "0" },
      inclusive: amounts,
    },
    { categoryId: "child", currency: "CHF", direct: amounts, inclusive: amounts },
  ],
  currencies: [{ currency: "CHF", ...amounts, uncategorized: "0" }],
  businessDate: "2026-10-05",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.spending).mockResolvedValue(report);
});
it("shows compact category spending with rounded net totals and no chart", async () => {
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("Food (inclusive) (archived branch)");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
    "Category",
    "Expenses",
    "Refunds",
    "Net spending",
    "Actions",
  ]);
  expect(screen.getByText("Food (inclusive) (archived branch)")).toBeVisible();
  expect(screen.queryByText("Empty (inclusive)")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand Food" }));
  expect(screen.getByText("↳ Groceries (archived branch)")).toBeVisible();
  expect(screen.getAllByText("-9.88")).toHaveLength(2);
  const childRow = screen.getByText("↳ Groceries (archived branch)").closest("tr")!;
  expect(within(childRow).queryByRole("button", { name: "Edit limit" })).toBeNull();
  expect(within(childRow).queryByRole("link", { name: "Manage limit" })).toBeNull();
  expect(within(childRow).getByRole("button", { name: "Supporting activity" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Show all categories"));
  expect(screen.getByText("Empty (inclusive)")).toBeVisible();
});
it("keeps refund-only rows without pie slices", async () => {
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    groups: report.groups.map((g) => ({ ...g, inclusive: { ...g.inclusive, expenses: "0" } })),
    currencies: [{ ...report.currencies[0], expenses: "0" }],
  });
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("Food (inclusive) (archived branch)");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("20.00")).toBeVisible();
});
it("supports activity without a limit, pagination and account links", async () => {
  vi.mocked(api.spendingActivity).mockResolvedValue({
    items: [
      {
        id: "op",
        accountId: "account",
        kind: "REFUND",
        amount: "3",
        currency: "CHF",
        transactionDate: "2026-10-02",
        valueDate: null,
        payee: "",
        description: "Synthetic refund",
        notes: "",
        version: 0,
        createdAt: "",
      },
    ],
    page: 0,
    hasMore: true,
  });
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("Food (inclusive) (archived branch)");
  fireEvent.click(screen.getAllByRole("button", { name: "Supporting activity" })[0]);
  expect(await screen.findByRole("link", { name: "Open account" })).toHaveAttribute(
    "href",
    "#/accounts/account",
  );
  fireEvent.click(screen.getByText("Next activity"));
  await waitFor(() =>
    expect(api.spendingActivity).toHaveBeenCalledWith("MONTH", "2026-10-01", "CHF", "food", 1),
  );
  fireEvent.click(screen.getByText("Close activity"));
  fireEvent.click(screen.getAllByRole("button", { name: "Supporting activity" })[1]);
  await waitFor(() =>
    expect(api.spendingActivity).toHaveBeenCalledWith("MONTH", "2026-10-01", "CHF", null, 0),
  );
});
it("loads a selected month automatically, retries errors and handles expired sessions", async () => {
  const expired = vi.fn();
  render(<SpendingPage onExpired={expired} />);
  await screen.findByText("Food (inclusive) (archived branch)");
  expect(screen.queryByRole("button", { name: "Show period" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Refresh spending" })).toBeNull();
  vi.mocked(api.spending).mockRejectedValueOnce(new ApiError(0, "Disconnected"));
  fireEvent.change(screen.getByLabelText("Period", { exact: true }), {
    target: { value: "2027-02" },
  });
  await screen.findByText("Disconnected");
  vi.mocked(api.spending).mockRejectedValueOnce(new ApiError(401, "Expired"));
  fireEvent.click(screen.getByText("Retry / reload spending"));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("switches months and years and shows a clear empty period", async () => {
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("Food (inclusive) (archived branch)");
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    periodType: "YEAR",
    periodStart: "2026-01-01",
  });
  fireEvent.click(screen.getByRole("button", { name: "Year" }));
  await screen.findByRole("heading", { name: "2026" });
  expect(api.spending).toHaveBeenLastCalledWith("YEAR", "2026-01-01");
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    periodType: "YEAR",
    periodStart: "2025-01-01",
    groups: [],
    currencies: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
  await screen.findByText("No expenses or refunds recorded in this period.");
  expect(api.spending).toHaveBeenLastCalledWith("YEAR", "2025-01-01");
  expect(screen.queryByRole("table")).toBeNull();
});

it("keeps partial year input local, commits on blur and restores invalid input", async () => {
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    periodType: "YEAR",
    periodStart: "2026-01-01",
  });
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByRole("button", { name: "Year" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Year" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Year" }));
  await screen.findByRole("heading", { name: "2026" });
  const input = screen.getByLabelText("Period", { exact: true });
  fireEvent.change(input, { target: { value: "26" } });
  expect(api.spending).toHaveBeenCalledTimes(2);
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    periodType: "YEAR",
    periodStart: "0026-01-01",
  });
  fireEvent.blur(input);
  await screen.findByRole("heading", { name: "0026" });
  expect(api.spending).toHaveBeenLastCalledWith("YEAR", "0026-01-01");
  fireEvent.change(input, { target: { value: "10000" } });
  fireEvent.blur(input);
  expect(input).toHaveValue(26);
  expect(api.spending).toHaveBeenCalledTimes(3);
});
