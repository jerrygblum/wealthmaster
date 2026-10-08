import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type {
  ExpectedDefinition,
  ExpectedOccurrence,
  ExpectedReport,
  Operation,
} from "../../types/models";
import { ExpectedPage } from "./ExpectedPage";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      expected: vi.fn(),
      accounts: vi.fn(),
      categories: vi.fn(),
      saveExpected: vi.fn(),
      deleteExpected: vi.fn(),
      expectedCandidates: vi.fn(),
      reconcileExpected: vi.fn(),
      recordExpected: vi.fn(),
    },
  };
});
const definition: ExpectedDefinition = {
  id: "bill",
  name: "Synthetic bill",
  kind: "EXPENSE",
  accountId: "cash",
  destinationAccountId: null,
  categoryId: null,
  amount: "10.12345678",
  currency: "CHF",
  dayOfMonth: 1,
  firstMonth: "2026-01-01",
  lastMonth: null,
  payee: "Synthetic merchant",
  notes: "",
  version: 0,
  available: true,
};
const occurrence: ExpectedOccurrence = {
  definition,
  expectedDate: "2026-10-01",
  version: 0,
  status: "OVERDUE",
  actual: null,
  difference: null,
  canRecord: true,
};
const report: ExpectedReport = {
  month: "2026-10-01",
  businessDate: "2026-10-08",
  definitions: [definition],
  items: [occurrence],
  totals: [
    {
      currency: "CHF",
      kind: "EXPENSE",
      expected: definition.amount,
      completed: "0",
      actual: "0",
      outstanding: definition.amount,
    },
  ],
};
const operation: Operation = {
  id: "actual",
  accountId: "cash",
  destinationAccountId: "",
  categoryId: null,
  kind: "EXPENSE",
  amount: "12",
  currency: "CHF",
  transactionDate: "2026-10-02",
  valueDate: null,
  payee: "Synthetic merchant",
  description: "Synthetic actual",
  notes: "",
  version: 1,
  createdAt: "",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.expected).mockResolvedValue(report);
  vi.mocked(api.accounts).mockResolvedValue([
    {
      id: "cash",
      name: "Synthetic cash",
      type: "CASH",
      institution: null,
      currency: "CHF",
      openingBalance: "0",
      openingDate: "2020-01-01",
      active: true,
      createdAt: "",
      version: 0,
      hasActivity: false,
    },
  ]);
  vi.mocked(api.categories).mockResolvedValue({ items: [], starterSetAvailable: true });
});
it("shows rounded expectations and changes month automatically", async () => {
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Overdue");
  expect(screen.getByText("10.12 CHF")).toBeVisible();
  expect(screen.getByRole("link", { name: "Synthetic cash" })).toHaveAttribute(
    "href",
    "#/accounts/cash",
  );
  vi.mocked(api.expected).mockResolvedValue({
    ...report,
    month: "2026-11-01",
    items: [],
    totals: [],
  });
  fireEvent.change(screen.getByLabelText("Expected month"), { target: { value: "2026-11" } });
  await screen.findByText(/No expected items/);
  expect(api.expected).toHaveBeenLastCalledWith("2026-11-01");
});
it("creates a recurring item with an explicit account and monthly schedule", async () => {
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Overdue");
  fireEvent.click(screen.getByRole("button", { name: "Add recurring item" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Synthetic salary" } });
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "INCOME" } });
  fireEvent.change(screen.getByLabelText("Account"), { target: { value: "cash" } });
  fireEvent.change(screen.getByLabelText("Monthly amount (CHF)"), {
    target: { value: "1000.00000001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save recurring item" }));
  await waitFor(() =>
    expect(api.saveExpected).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Synthetic salary",
        kind: "INCOME",
        accountId: "cash",
        amount: "1000.00000001",
        firstMonth: "2026-10-01",
        dayOfMonth: 1,
      }),
      undefined,
    ),
  );
});
it("retains edited input after a stale request and requires cancellation", async () => {
  vi.mocked(api.saveExpected).mockRejectedValue(new ApiError(412, "Recurring item changed"));
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Overdue");
  fireEvent.click(screen.getByRole("button", { name: "Edit Synthetic bill" }));
  fireEvent.change(screen.getByLabelText("Monthly amount (CHF)"), { target: { value: "25" } });
  fireEvent.click(screen.getByRole("button", { name: "Save recurring item" }));
  await screen.findByText("Recurring item changed");
  expect(screen.getByLabelText("Monthly amount (CHF)")).toHaveValue("25");
  expect(screen.getByRole("button", { name: "Save recurring item" })).toBeDisabled();
  expect(screen.getByText(/Changes apply to every month/)).toBeVisible();
});
it("paginates suggestions and only links after confirmation", async () => {
  vi.mocked(api.expectedCandidates).mockResolvedValue({
    items: [operation],
    page: 0,
    hasMore: true,
  });
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Overdue");
  fireEvent.click(screen.getByRole("button", { name: "Match Synthetic bill" }));
  await screen.findByText(/Synthetic actual/);
  expect(api.reconcileExpected).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Next suggestions" }));
  await waitFor(() =>
    expect(api.expectedCandidates).toHaveBeenLastCalledWith(occurrence, "2026-10-01", 1),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm match" }));
  await waitFor(() =>
    expect(api.reconcileExpected).toHaveBeenCalledWith(occurrence, "2026-10-01", operation, false),
  );
});
it("opens a prefilled actual form and waits for reviewed saving", async () => {
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Overdue");
  fireEvent.click(screen.getByRole("button", { name: "Record Synthetic bill" }));
  expect(screen.getByLabelText("Actual amount (CHF)")).toHaveValue("10.12345678");
  expect(screen.getByLabelText("Transaction date")).toHaveValue("2026-10-01");
  expect(api.recordExpected).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Actual amount (CHF)"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Save actual transaction" }));
  await waitFor(() =>
    expect(api.recordExpected).toHaveBeenCalledWith(
      occurrence,
      "2026-10-01",
      expect.objectContaining({ amount: "12", description: "Synthetic bill" }),
    ),
  );
});
it("skips one month and offers undo without changing the schedule", async () => {
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Overdue");
  vi.mocked(api.expected).mockResolvedValue({
    ...report,
    items: [{ ...occurrence, status: "SKIPPED", version: 1, canRecord: false }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Skip Synthetic bill" }));
  await screen.findByText("Skipped");
  expect(api.reconcileExpected).toHaveBeenCalledWith(occurrence, "2026-10-01", undefined, true);
  fireEvent.click(screen.getByRole("button", { name: "Undo skip Synthetic bill" }));
  await waitFor(() =>
    expect(api.reconcileExpected).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 1 }),
      "2026-10-01",
      undefined,
      false,
    ),
  );
});
it("retains a review action for a deleted linked transaction and confirms deletion", async () => {
  vi.mocked(api.expected).mockResolvedValue({
    ...report,
    items: [{ ...occurrence, status: "NEEDS_REVIEW", canRecord: false }],
  });
  render(<ExpectedPage onExpired={() => {}} />);
  await screen.findByText("Needs review");
  expect(screen.getByRole("button", { name: "Unlink Synthetic bill" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Record Synthetic bill" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Delete Synthetic bill" }));
  expect(api.deleteExpected).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
  await waitFor(() => expect(api.deleteExpected).toHaveBeenCalledWith(definition));
});
it("handles expired sessions", async () => {
  vi.mocked(api.expected).mockRejectedValue(new ApiError(401, "Expired"));
  const expired = vi.fn();
  render(<ExpectedPage onExpired={expired} />);
  await waitFor(() => expect(expired).toHaveBeenCalled());
});
