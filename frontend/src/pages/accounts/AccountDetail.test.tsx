import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import { AccountDetail } from "./AccountDetail";
vi.mock("../../services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/api")>()),
  api: {
    categories: vi.fn(),
    account: vi.fn(),
    accounts: vi.fn(),
    activity: vi.fn(),
    saveActivity: vi.fn(),
    deleteActivity: vi.fn(),
  },
}));
const account = {
  id: "a",
  name: "Synthetic cash",
  type: "CASH" as const,
  currency: "CHF",
  openingBalance: "0",
  currentBalance: "-2.00000001",
  balanceAsOf: "2026-10-04",
  openingDate: "2020-01-01",
  active: true,
  institution: null,
  createdAt: "",
  version: 0,
  hasActivity: true,
};
const entry = {
  id: "op",
  accountId: "a",
  kind: "EXPENSE" as const,
  amount: "2.00000001",
  currency: "CHF",
  transactionDate: "2026-10-04",
  valueDate: null,
  payee: "",
  description: "Synthetic purchase",
  notes: "",
  version: 0,
  createdAt: "",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.categories).mockResolvedValue({ items: [], starterSetAvailable: true });
  vi.mocked(api.account).mockResolvedValue(account);
  vi.mocked(api.accounts).mockResolvedValue([
    account,
    { ...account, id: "b", name: "Synthetic bank" },
  ]);
  vi.mocked(api.activity).mockResolvedValue({ items: [entry], page: 0, hasMore: false });
});
it("shows exact balances and preserves failed form input", async () => {
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("CHF -2.00");
  fireEvent.click(screen.getByText("Add transaction"));
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "1.12345678" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Synthetic refund" } });
  fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "REFUND" } });
  vi.mocked(api.saveActivity).mockRejectedValue(new ApiError(400, "Check date"));
  fireEvent.click(screen.getByText("Save activity"));
  await screen.findByText("Check date");
  expect(screen.getByLabelText("Amount (CHF)")).toHaveValue("1.12345678");
  expect(screen.getByLabelText("Description")).toHaveValue("Synthetic refund");
});
it("shows compact rows with accessible inline actions and preserves transaction details", async () => {
  vi.mocked(api.activity).mockResolvedValue({
    items: [
      {
        ...entry,
        valueDate: "2026-10-03",
        payee: "Synthetic merchant",
        notes: "Synthetic receipt note",
      },
    ],
    page: 0,
    hasMore: false,
  });
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  const table = await screen.findByRole("table", { name: "Account transactions" });
  expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(screen.queryByRole("article")).toBeNull();
  expect(screen.getByText("Expense · Synthetic merchant")).toBeVisible();
  expect(screen.getByText("Value date: 2026-10-03")).toBeVisible();
  expect(screen.getByText("Category: Uncategorized")).toBeVisible();
  const edit = screen.getByRole("button", { name: "Edit entry" });
  expect(edit).toHaveClass("compact-action");
  expect(edit).toHaveAttribute("title", "Edit Synthetic purchase");
  expect(edit.closest("tr")).toContainElement(screen.getByRole("button", { name: "Delete entry" }));
  fireEvent.click(screen.getByText("Notes"));
  expect(screen.getByText("Synthetic receipt note")).toBeVisible();
});
it("identifies incoming transfers and links their source account", async () => {
  vi.mocked(api.activity).mockResolvedValue({
    items: [{ ...entry, accountId: "b", destinationAccountId: "a", kind: "TRANSFER" }],
    page: 0,
    hasMore: false,
  });
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Transfer in");
  expect(screen.getByRole("link", { name: "Synthetic bank" })).toHaveAttribute(
    "href",
    "#/accounts/b",
  );
  expect(screen.queryByText("Category: Uncategorized")).toBeNull();
});
it("accepts future transaction and value dates and labels scheduled activity", async () => {
  vi.mocked(api.activity).mockResolvedValue({
    items: [{ ...entry, transactionDate: "2026-11-10" }],
    page: 0,
    hasMore: false,
  });
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Expense · Scheduled");
  fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
  const date = screen.getByLabelText("Transaction date");
  expect(date).toHaveAttribute("max", "9999-12-31");
  fireEvent.change(date, { target: { value: "2026-12-10" } });
  fireEvent.change(screen.getByLabelText("Value date (optional)"), {
    target: { value: "2026-12-11" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() =>
    expect(api.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ transactionDate: "2026-12-10", valueDate: "2026-12-11" }),
      expect.objectContaining({ transactionDate: "2026-11-10" }),
    ),
  );
});
it("accepts historical transaction and value dates before account opening", async () => {
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByRole("button", { name: "Edit entry" });
  fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
  expect(screen.getByLabelText("Transaction date")).toHaveAttribute("min", "0001-01-01");
  expect(screen.getByLabelText("Value date (optional)")).toHaveAttribute("min", "0001-01-01");
  fireEvent.change(screen.getByLabelText("Transaction date"), { target: { value: "2019-01-15" } });
  fireEvent.change(screen.getByLabelText("Value date (optional)"), {
    target: { value: "2019-01-14" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() =>
    expect(api.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ transactionDate: "2019-01-15", valueDate: "2019-01-14" }),
      entry,
    ),
  );
});
it("confirms both transfer sides and sends the paired deletion", async () => {
  const transfer = { ...entry, kind: "TRANSFER" as const, destinationAccountId: "b" };
  vi.mocked(api.activity).mockResolvedValue({ items: [transfer], page: 0, hasMore: false });
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Synthetic purchase");
  fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
  await screen.findByText(/Both sides of this transfer/);
  fireEvent.click(screen.getByText("Confirm deletion"));
  await waitFor(() => expect(api.deleteActivity).toHaveBeenCalledWith(transfer));
});
it("keeps archived activity readable and disables editing", async () => {
  vi.mocked(api.account).mockResolvedValue({ ...account, active: false });
  vi.mocked(api.accounts).mockResolvedValue([{ ...account, active: false }]);
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Synthetic purchase");
  expect(screen.getByText("Add transaction")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit entry" })).toBeDisabled();
});
it("requires reload after a stale edit", async () => {
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Synthetic purchase");
  fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
  vi.mocked(api.saveActivity).mockRejectedValue(new ApiError(412, "Activity changed"));
  fireEvent.click(screen.getByText("Save activity"));
  await screen.findByText("Activity changed");
  expect(screen.getByText("Save activity")).toBeDisabled();
});
it("loads the next group of activity and expires unauthorized sessions", async () => {
  vi.mocked(api.activity)
    .mockResolvedValueOnce({ items: [entry], page: 0, hasMore: true })
    .mockResolvedValueOnce({ items: [], page: 1, hasMore: false });
  const expired = vi.fn();
  render(<AccountDetail id="a" onBack={() => {}} onExpired={expired} />);
  await screen.findByText("Synthetic purchase");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText("No activity yet.");
  expect(api.activity).toHaveBeenLastCalledWith("a", 1);
  vi.mocked(api.activity).mockRejectedValueOnce(new ApiError(401, "Expired"));
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  await waitFor(() => expect(expired).toHaveBeenCalled());
});
it("offers both hierarchy levels, shares refund categories and clears incompatible kinds", async () => {
  const root = {
    id: "root",
    name: "Synthetic Food",
    type: "SPENDING" as const,
    parentId: null,
    active: true,
    available: true,
    createdAt: "",
    version: 0,
    hasActivity: false,
    hasChildren: true,
  };
  vi.mocked(api.categories).mockResolvedValue({
    items: [
      root,
      { ...root, id: "child", name: "Groceries", parentId: "root" },
      { ...root, id: "salary", name: "Salary", type: "INCOME", hasChildren: false },
    ],
    starterSetAvailable: false,
  });
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Synthetic purchase");
  fireEvent.click(screen.getByText("Add transaction"));
  expect(screen.getByRole("option", { name: "Synthetic Food" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Synthetic Food → Groceries" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Category (optional)"), { target: { value: "child" } });
  fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "REFUND" } });
  expect(screen.getByLabelText("Category (optional)")).toHaveValue("child");
  fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "INCOME" } });
  expect(screen.getByLabelText("Category (optional)")).toHaveValue("");
  expect(screen.queryByRole("option", { name: "Synthetic Food" })).not.toBeInTheDocument();
});
it("keeps an archived assignment on unrelated edits and permits clearing", async () => {
  const root = {
    id: "root",
    name: "Synthetic Food",
    type: "SPENDING" as const,
    parentId: null,
    active: false,
    available: false,
    createdAt: "",
    version: 0,
    hasActivity: true,
    hasChildren: false,
  };
  const categorized = {
    ...entry,
    categoryId: "root",
    category: { id: "root", name: "Synthetic Food", parentName: null, available: false },
  };
  vi.mocked(api.categories).mockResolvedValue({ items: [root], starterSetAvailable: false });
  vi.mocked(api.activity).mockResolvedValue({ items: [categorized], page: 0, hasMore: false });
  render(<AccountDetail id="a" onBack={() => {}} onExpired={() => {}} />);
  await screen.findByText("Category: Synthetic Food (archived)");
  fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
  expect(screen.getByLabelText("Category (optional)")).toHaveValue("root");
  fireEvent.change(screen.getByLabelText("Category (optional)"), { target: { value: "" } });
  fireEvent.click(screen.getByText("Save activity"));
  await waitFor(() =>
    expect(api.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
      categorized,
    ),
  );
});
