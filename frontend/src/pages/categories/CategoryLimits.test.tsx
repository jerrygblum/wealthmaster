import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { BudgetSetting, Category } from "../../types/models";
import { CategoryLimits } from "./CategoryLimits";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, budgetSettings: vi.fn(), saveBudgetSetting: vi.fn() } };
});
const category: Category = {
  id: "food",
  name: "Food",
  type: "SPENDING",
  parentId: null,
  active: true,
  available: true,
  hasActivity: false,
  hasChildren: false,
  createdAt: "",
  version: 0,
};
const setting: BudgetSetting = {
  id: "setting",
  categoryId: "food",
  currency: "CHF",
  mode: "MONTH",
  limit: "100.00000000",
  version: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.budgetSettings).mockResolvedValue({ businessDate: "2026-10-05", items: [] });
});
function page(categories = [category], expired = vi.fn()) {
  render(
    <CategoryLimits
      categories={categories}
      renderCategory={(c) => <h3>{c.name}</h3>}
      onExpired={expired}
    />,
  );
}
it("shows compact normal controls and creates a monthly default directly in the card", async () => {
  page();
  await screen.findByText("Food");
  await waitFor(() => expect(screen.getByRole("button", { name: "Monthly" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
  fireEvent.change(screen.getByLabelText("Normal limit amount for Food CHF"), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByText("Save normal limit"));
  await waitFor(() =>
    expect(api.saveBudgetSetting).toHaveBeenCalledWith({
      categoryId: "food",
      currency: "CHF",
      mode: "MONTH",
      limit: "100",
      expected: null,
    }),
  );
  expect(screen.queryByLabelText("Period type")).toBeNull();
});
it("retains failed input and requires reload after a stale version", async () => {
  vi.mocked(api.budgetSettings).mockResolvedValue({ businessDate: "2026-10-05", items: [setting] });
  vi.mocked(api.saveBudgetSetting).mockRejectedValue(new ApiError(412, "Normal changed"));
  page();
  fireEvent.change(await screen.findByLabelText("Normal limit amount for Food CHF"), {
    target: { value: "120.12345678" },
  });
  fireEvent.click(screen.getByText("Save normal limit"));
  await screen.findByText("Normal changed");
  expect(screen.getByLabelText("Normal limit amount for Food CHF")).toHaveValue("120.12345678");
  expect(screen.getByText("Save normal limit")).toBeDisabled();
  expect(api.saveBudgetSetting).toHaveBeenCalledWith(
    expect.objectContaining({ expected: { id: "setting", version: 2 } }),
  );
  vi.mocked(api.budgetSettings).mockResolvedValue({
    businessDate: "2026-10-05",
    items: [{ ...setting, version: 3, limit: "130" }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Normal limit amount for Food CHF")).toHaveValue("130"),
  );
  fireEvent.change(screen.getByLabelText("Normal limit amount for Food CHF"), {
    target: { value: "140" },
  });
  fireEvent.click(screen.getByText("Save normal limit"));
  await waitFor(() =>
    expect(api.saveBudgetSetting).toHaveBeenLastCalledWith(
      expect.objectContaining({ expected: { id: "setting", version: 3 }, limit: "140" }),
    ),
  );
});
it("No limit clears the normal amount while zero remains a valid allowance", async () => {
  vi.mocked(api.budgetSettings).mockResolvedValue({ businessDate: "2026-10-05", items: [setting] });
  page();
  await screen.findByLabelText("Normal limit amount for Food CHF");
  fireEvent.click(screen.getByRole("button", { name: "No limit" }));
  fireEvent.click(screen.getByText("Save normal limit"));
  await waitFor(() =>
    expect(api.saveBudgetSetting).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "NONE", limit: null }),
    ),
  );
});
it("blocks enabling limits on archived branches while retaining existing amount edits", async () => {
  vi.mocked(api.budgetSettings).mockResolvedValue({ businessDate: "2026-10-05", items: [setting] });
  page([{ ...category, available: false, active: false }]);
  await screen.findByLabelText("Normal limit amount for Food CHF");
  expect(screen.getByRole("button", { name: "Yearly" })).toBeDisabled();
  expect(screen.getByLabelText("Normal limit amount for Food CHF")).toBeEnabled();
});
it("keeps category management visible through a failed setting request and handles expiry", async () => {
  const expired = vi.fn();
  vi.mocked(api.budgetSettings)
    .mockRejectedValueOnce(new ApiError(0, "Disconnected"))
    .mockRejectedValueOnce(new ApiError(401, "Expired"));
  page([category], expired);
  await screen.findByText("Disconnected");
  expect(screen.getByText("Food")).toBeVisible();
  fireEvent.click(screen.getByText("Retry normal limits"));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});
it("switches an existing normal setting to yearly without losing its version", async () => {
  vi.mocked(api.budgetSettings).mockResolvedValue({ businessDate: "2026-10-05", items: [setting] });
  page();
  await screen.findByLabelText("Normal limit amount for Food CHF");
  fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
  fireEvent.change(screen.getByLabelText("Normal limit amount for Food CHF"), {
    target: { value: "1200" },
  });
  fireEvent.click(screen.getByText("Save normal limit"));
  await waitFor(() =>
    expect(api.saveBudgetSetting).toHaveBeenCalledWith({
      categoryId: "food",
      currency: "CHF",
      mode: "YEAR",
      limit: "1200",
      expected: { id: "setting", version: 2 },
    }),
  );
});
