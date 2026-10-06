import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { Category } from "../../types/models";
import { CategoriesPage } from "./CategoriesPage";
vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: {
    categories: vi.fn(),
    budgetSettings: vi.fn(),
    preferences: vi.fn(),
    saveCategory: vi.fn(),
  },
}));
const category: Category = {
  id: "food",
  name: "Food",
  type: "SPENDING",
  parentId: null,
  active: true,
  available: true,
  hasActivity: true,
  hasChildren: false,
  createdAt: "",
  version: 3,
};
const setting = {
  id: "setting",
  categoryId: "food",
  currency: "CHF",
  mode: "MONTH" as const,
  limit: "100",
  monthlyLimit: "100",
  yearlyLimit: "1200",
  version: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.categories).mockResolvedValue({ items: [category], starterSetAvailable: false });
  vi.mocked(api.budgetSettings).mockResolvedValue({ businessDate: "2026-10-06", items: [setting] });
  vi.mocked(api.preferences).mockResolvedValue({
    defaultCurrency: "CHF",
    version: 1,
    hasLimitsToReset: true,
  });
});
function page(expired = vi.fn()) {
  render(
    <CategoriesPage
      user={{ id: "owner", email: "owner@example.test" }}
      onExpired={expired}
      onLogout={vi.fn()}
    />,
  );
}
async function edit() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit category" }));
  await waitFor(() => expect(screen.getByLabelText("Spending limit")).toBeEnabled());
}
it("edits yearly limits in the category form with both optimistic references", async () => {
  page();
  await edit();
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "YEAR" } });
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "1440" } });
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        normalLimit: {
          mode: "YEAR",
          limit: "1440",
          expected: { id: "setting", version: 2 },
          expectedPreferencesVersion: 1,
        },
      }),
      category,
    ),
  );
});
it("distinguishes a zero allowance from clearing the limit", async () => {
  page();
  await edit();
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "0" } });
  vi.mocked(api.saveCategory).mockRejectedValueOnce(new ApiError(409, "Retained"));
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Retained");
  expect(api.saveCategory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      normalLimit: {
        limit: "0",
        mode: "MONTH",
        expected: { id: "setting", version: 2 },
        expectedPreferencesVersion: 1,
      },
    }),
    category,
  );
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "NONE" } });
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        normalLimit: {
          limit: null,
          mode: "NONE",
          expected: { id: "setting", version: 2 },
          expectedPreferencesVersion: 1,
        },
      }),
      category,
    ),
  );
});
it("requires explicit currency selection while allowing metadata saves", async () => {
  vi.mocked(api.preferences).mockResolvedValue({
    defaultCurrency: null,
    version: 0,
    hasLimitsToReset: true,
  });
  page();
  await edit();
  expect(screen.getByRole("option", { name: "Monthly" })).toBeDisabled();
  expect(screen.getAllByRole("link", { name: /default currency in Settings/ })[0]).toHaveAttribute(
    "href",
    "#/settings",
  );
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Shopping" } });
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenCalledWith(
      { name: "Shopping", type: "SPENDING", parentId: null },
      category,
    ),
  );
});
it("preserves limits when their load fails and routes expiry", async () => {
  vi.mocked(api.budgetSettings).mockRejectedValueOnce(new ApiError(0, "Limit request failed"));
  page();
  await screen.findByText("Limit request failed");
  fireEvent.click(screen.getByRole("button", { name: "Edit category" }));
  expect(screen.getByLabelText("Spending limit")).toBeDisabled();
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenCalledWith(
      { name: "Food", type: "SPENDING", parentId: null },
      category,
    ),
  );
});
it("allows either input unit for an existing archived limit", async () => {
  vi.mocked(api.categories).mockResolvedValue({
    items: [{ ...category, available: false, active: false }],
    starterSetAvailable: false,
  });
  page();
  await screen.findByText("No active spending categories.");
  fireEvent.click(screen.getByText("Archived categories"));
  await edit();
  expect(screen.getByRole("option", { name: "Yearly" })).toBeEnabled();
  expect(screen.getByLabelText("Amount (CHF)")).toBeEnabled();
});
it("retains stale form input until cancel reloads", async () => {
  vi.mocked(api.saveCategory).mockRejectedValue(new ApiError(412, "Default currency changed"));
  page();
  await edit();
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "120" } });
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Default currency changed");
  expect(screen.getByText("Save category")).toBeDisabled();
  expect(screen.getByLabelText("Amount (CHF)")).toHaveValue("120");
  fireEvent.click(screen.getByText("Cancel"));
  await screen.findByRole("button", { name: "Edit category" });
  await edit();
  expect(screen.getByLabelText("Amount (CHF)")).toHaveValue("100");
});

it("creates category details and a new limit in one request, hiding limits for income", async () => {
  page();
  fireEvent.click(await screen.findByText("Create category"));
  await waitFor(() => expect(screen.getByLabelText("Spending limit")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Travel" } });
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "YEAR" } });
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "1200.12345678" } });
  vi.mocked(api.saveCategory).mockRejectedValue(new ApiError(409, "Retained creation"));
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Retained creation");
  expect(api.saveCategory).toHaveBeenLastCalledWith(
    {
      name: "Travel",
      type: "SPENDING",
      parentId: null,
      normalLimit: {
        mode: "YEAR",
        limit: "1200.12345678",
        expected: null,
        expectedPreferencesVersion: 1,
      },
    },
    undefined,
  );
  fireEvent.change(screen.getByLabelText("Category type"), { target: { value: "INCOME" } });
  expect(screen.queryByLabelText("Spending limit")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenLastCalledWith(
      { name: "Travel", type: "INCOME", parentId: null },
      undefined,
    ),
  );
});

it("hides subcategory limits and omits a previously entered allowance when selecting a parent", async () => {
  page();
  fireEvent.click(await screen.findByText("Create category"));
  await waitFor(() => expect(screen.getByLabelText("Spending limit")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Groceries" } });
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "MONTH" } });
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "50" } });
  fireEvent.change(screen.getByLabelText("Parent category (optional)"), {
    target: { value: "food" },
  });
  expect(screen.queryByLabelText("Spending limit")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Amount (CHF)")).not.toBeInTheDocument();
  expect(screen.getByText(/counts toward its main category’s limit/)).toBeVisible();
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenCalledWith(
      { name: "Groceries", type: "SPENDING", parentId: "food" },
      undefined,
    ),
  );
});
it("edits subcategory details without limit controls", async () => {
  const child = { ...category, id: "groceries", name: "Groceries", parentId: "food" };
  vi.mocked(api.categories).mockResolvedValue({
    items: [category, child],
    starterSetAvailable: false,
  });
  vi.mocked(api.budgetSettings).mockResolvedValue({
    businessDate: "2026-10-06",
    items: [setting],
  });
  page();
  const buttons = await screen.findAllByRole("button", { name: "Edit category" });
  fireEvent.click(buttons[1]);
  expect(screen.queryByLabelText("Spending limit")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Daily food" } });
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenCalledWith(
      { name: "Daily food", type: "SPENDING", parentId: "food" },
      child,
    ),
  );
});

it("converts units without submitting a changed limit until the amount is edited", async () => {
  vi.mocked(api.budgetSettings).mockResolvedValue({
    businessDate: "2026-10-06",
    items: [
      { ...setting, mode: "YEAR", limit: "100", monthlyLimit: "8.33333333", yearlyLimit: "100" },
    ],
  });
  page();
  await edit();
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "MONTH" } });
  expect(screen.getByLabelText("Amount (CHF)")).toHaveValue("8.33333333");
  expect(screen.getByText("100.00 CHF / year")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "YEAR" } });
  expect(screen.getByLabelText("Amount (CHF)")).toHaveValue("100");
  fireEvent.change(screen.getByLabelText("Spending limit"), { target: { value: "MONTH" } });
  vi.mocked(api.saveCategory).mockRejectedValueOnce(new ApiError(409, "Retained input"));
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Retained input");
  expect(api.saveCategory).toHaveBeenLastCalledWith(
    { name: "Food", type: "SPENDING", parentId: null },
    category,
  );
  fireEvent.change(screen.getByLabelText("Amount (CHF)"), { target: { value: "10" } });
  expect(screen.getByText("120.00 CHF / year")).toBeVisible();
  fireEvent.click(screen.getByText("Save category"));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenLastCalledWith(
      {
        name: "Food",
        type: "SPENDING",
        parentId: null,
        normalLimit: {
          mode: "MONTH",
          limit: "10",
          expected: { id: "setting", version: 2 },
          expectedPreferencesVersion: 1,
        },
      },
      category,
    ),
  );
});
