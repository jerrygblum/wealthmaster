import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { OriginalCategoryGroup } from "../../types/originalCategories";
import type { Category } from "../../types/models";
import { OriginalCategoriesPage } from "./OriginalCategoriesPage";

vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: { originalCategoryGroups: vi.fn(), categories: vi.fn(), mapOriginalCategory: vi.fn() },
}));
const target: Category = {
  id: "food",
  name: "Groceries",
  type: "SPENDING",
  parentId: null,
  active: true,
  available: true,
  version: 3,
  createdAt: "",
  hasActivity: false,
  hasChildren: false,
};
const group: OriginalCategoryGroup = {
  originalCategory: "Old food",
  type: "SPENDING",
  uncategorizedCount: 2,
  transactions: [0, 1, 2].map((index) => ({
    id: `transaction-${index}`,
    version: index,
    accountId: "bank",
    accountName: "Synthetic Bank",
    date: "2024-01-05",
    kind: index === 1 ? "REFUND" : "EXPENSE",
    amount: "10.12345678",
    currency: "CHF",
    description: `Synthetic row ${index} | Original category: Old food`,
    categoryId: index === 2 ? "old" : null,
    category:
      index === 2 ? { id: "old", name: "Existing", parentName: null, available: true } : null,
  })),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.originalCategoryGroups).mockResolvedValue([group]);
  vi.mocked(api.categories).mockResolvedValue({
    items: [
      target,
      { ...target, id: "salary", name: "Salary", type: "INCOME" },
      { ...target, id: "archived", name: "Archived", available: false },
    ],
    starterSetAvailable: false,
  });
  vi.mocked(api.mapOriginalCategory).mockResolvedValue({ updated: 2 });
});
async function review() {
  fireEvent.click(await screen.findByRole("button", { name: "Review Old food (Spending)" }));
  fireEvent.change(screen.getByLabelText("Map to existing category"), {
    target: { value: "food" },
  });
}
it("lists counts and transaction details and maps only reviewed uncategorized transactions", async () => {
  render(<OriginalCategoriesPage onExpired={vi.fn()} />);
  await review();
  const detail = screen.getByRole("region", { name: "Review original category" });
  expect(within(detail).getByText("3 transactions · 2 uncategorized")).toBeVisible();
  expect(within(detail).getByText("Synthetic row 0 | Original category: Old food")).toBeVisible();
  expect(within(detail).getByText("REFUND")).toBeVisible();
  expect(within(detail).getAllByText("CHF 10.12345678")).toHaveLength(3);
  expect(within(detail).getByText("Keep current category")).toBeVisible();
  expect(screen.queryByRole("option", { name: "Salary" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Archived" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Map 2 transactions" }));
  expect(api.mapOriginalCategory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm mapping" }));
  await waitFor(() =>
    expect(api.mapOriginalCategory).toHaveBeenCalledWith({
      originalCategory: "Old food",
      type: "SPENDING",
      categoryId: "food",
      categoryVersion: 3,
      includeCategorized: false,
      transactions: [
        { id: "transaction-0", version: 0 },
        { id: "transaction-1", version: 1 },
      ],
    }),
  );
  expect(await screen.findByText(/2 transactions categorized/)).toBeVisible();
});
it("requires explicit opt-in to replace existing assignments and reopens review after a change", async () => {
  render(<OriginalCategoriesPage onExpired={vi.fn()} />);
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Map 2 transactions" }));
  fireEvent.click(screen.getByLabelText(/Include already categorized/));
  expect(screen.queryByRole("button", { name: "Confirm mapping" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Map 3 transactions" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm mapping" }));
  await waitFor(() =>
    expect(api.mapOriginalCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        includeCategorized: true,
        transactions: [
          { id: "transaction-0", version: 0 },
          { id: "transaction-1", version: 1 },
          { id: "transaction-2", version: 2 },
        ],
      }),
    ),
  );
});
it("shows stale errors and requires refresh before retrying", async () => {
  vi.mocked(api.mapOriginalCategory).mockRejectedValue(
    new ApiError(412, "A transaction changed. Refresh."),
  );
  render(<OriginalCategoriesPage onExpired={vi.fn()} />);
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Map 2 transactions" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm mapping" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("A transaction changed");
  expect(screen.getByRole("button", { name: "Map 2 transactions" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh groups" }));
  await waitFor(() => expect(api.originalCategoryGroups).toHaveBeenCalledTimes(2));
});
it("handles empty and failed loads without offering a mapping", async () => {
  vi.mocked(api.originalCategoryGroups).mockResolvedValue([]);
  render(<OriginalCategoriesPage onExpired={vi.fn()} />);
  expect(await screen.findByText("No original categories left to map")).toBeVisible();
  vi.mocked(api.originalCategoryGroups).mockRejectedValue(new ApiError(0, "Offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh groups" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
});

it("hides completed groups, including after applying the last mapping", async () => {
  const completed = { ...group, originalCategory: "Completed", uncategorizedCount: 0 };
  vi.mocked(api.originalCategoryGroups)
    .mockResolvedValueOnce([completed, group])
    .mockResolvedValue([completed]);
  render(<OriginalCategoriesPage onExpired={vi.fn()} />);
  await review();
  expect(screen.queryByRole("button", { name: "Review Completed (Spending)" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Map 2 transactions" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm mapping" }));
  expect(await screen.findByText("No original categories left to map")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Review original category" })).toBeNull();
});
