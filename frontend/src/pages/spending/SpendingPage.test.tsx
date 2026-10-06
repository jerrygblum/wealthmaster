import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  settings: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.spending).mockResolvedValue(report);
});
it("shows spending without limits with gross expense chart and exact net table", async () => {
  render(<SpendingPage onExpired={() => {}} />);
  await screen.findByText("Expenses before refunds");
  expect(screen.getByRole("img")).toHaveAccessibleName("Expenses before refunds — CHF");
  expect(screen.getByText("Food (inclusive) (archived branch)")).toBeVisible();
  expect(screen.queryByText("Empty (inclusive)")).toBeNull();
  fireEvent.click(screen.getByText("Expand Food"));
  expect(screen.getByText("↳ Groceries (archived branch)")).toBeVisible();
  expect(screen.getAllByText("-9.87654322")).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "Normal setting" })[0]).toHaveAttribute(
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
  expect(screen.getByText("20.00000000")).toBeVisible();
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
  fireEvent.click(screen.getAllByText("Supporting activity")[0]);
  expect(await screen.findByRole("link", { name: "Open account" })).toHaveAttribute(
    "href",
    "#/accounts/account",
  );
  fireEvent.click(screen.getByText("Next activity"));
  await waitFor(() =>
    expect(api.spendingActivity).toHaveBeenCalledWith("MONTH", "2026-10-01", "CHF", "food", 1),
  );
  fireEvent.click(screen.getByText("Close activity"));
  fireEvent.click(screen.getAllByText("Supporting activity")[1]);
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
