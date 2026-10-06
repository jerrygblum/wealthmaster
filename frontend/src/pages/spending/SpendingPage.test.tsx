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
  currencies: [
    { currency: "CHF", ...amounts, uncategorized: "0", unbudgeted: amounts.netSpending },
  ],
  limits: [],
  businessDate: "2026-10-05",
  defaultCurrency: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.spending).mockResolvedValue(report);
});
it("shows spending without limits with gross expense chart and rounded net table", async () => {
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("Expenses before refunds");
  expect(screen.getByRole("img")).toHaveAccessibleName("Expenses before refunds — CHF");
  expect(screen.getByText("Food (inclusive) (archived branch)")).toBeVisible();
  expect(screen.queryByText("Empty (inclusive)")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand Food" }));
  expect(screen.getByText("↳ Groceries (archived branch)")).toBeVisible();
  expect(screen.getAllByText("-9.88")).toHaveLength(2);
  const childRow = screen.getByText("↳ Groceries (archived branch)").closest("tr")!;
  expect(within(childRow).queryByRole("button", { name: "Edit limit" })).toBeNull();
  expect(within(childRow).queryByRole("link", { name: "Manage limit" })).toBeNull();
  expect(within(childRow).getByText("Included in main category")).toBeVisible();
  expect(within(childRow).getByRole("button", { name: "Supporting activity" })).toBeVisible();
  expect(screen.getAllByRole("link", { name: "Manage limit" })[0]).toHaveAttribute(
    "href",
    "#/categories?categoryId=food",
  );
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
  expect(await screen.findByText(/No expenses to chart/)).toBeVisible();
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
  await screen.findByText("Expenses before refunds");
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
it("retains independent period input, retries errors and handles expired sessions", async () => {
  const expired = vi.fn();
  render(<SpendingPage onExpired={expired} />);
  await screen.findByText("Expenses before refunds");
  fireEvent.change(screen.getByLabelText("Period", { exact: true }), {
    target: { value: "2027-02" },
  });
  expect(api.spending).toHaveBeenCalledTimes(1);
  vi.mocked(api.spending).mockRejectedValueOnce(new ApiError(0, "Disconnected"));
  fireEvent.click(screen.getByText("Show period"));
  await screen.findByText("Disconnected");
  vi.mocked(api.spending).mockRejectedValueOnce(new ApiError(401, "Expired"));
  fireEvent.click(screen.getByText("Retry / reload spending"));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("shows selected-period allowances and management links without override controls", async () => {
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    limits: [
      {
        categoryId: "food",
        currency: "CHF",
        periodType: "MONTH",
        periodStart: "2026-10-01",
        limit: "100",
        actual: "-9.87654322",
        remaining: "109.87654322",
        percentage: "-9.88",
        overBudget: false,
        available: false,
      },
    ],
  });
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("100.00 CHF");
  expect(screen.getByText("2026-10 · Monthly")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Edit limit" })).toBeNull();
  expect(screen.queryByText("Spending used")).toBeNull();
  expect(screen.getByRole("link", { name: "Manage limit" })).toHaveAttribute(
    "href",
    "#/categories?categoryId=food",
  );
  vi.mocked(api.spending).mockResolvedValue({
    ...report,
    periodType: "YEAR",
    periodStart: "2026-01-01",
    limits: [
      {
        categoryId: "food",
        currency: "CHF",
        periodType: "YEAR",
        periodStart: "2026-01-01",
        limit: "1200",
        actual: "-9.87654322",
        remaining: "1209.87654322",
        percentage: "-0.82",
        overBudget: false,
        available: false,
      },
    ],
  });
  fireEvent.change(screen.getByLabelText("Period type"), { target: { value: "YEAR" } });
  await screen.findByText("1’200.00 CHF");
  expect(screen.getByText("2026 · Yearly")).toBeVisible();
  expect(screen.queryByText(/Edit months/)).toBeNull();
});
