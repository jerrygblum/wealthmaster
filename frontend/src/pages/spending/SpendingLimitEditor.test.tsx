import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { BudgetComparison } from "../../types/models";
import { MonthlyLimitBreakdown } from "./MonthlyLimitBreakdown";
import { SpendingLimitEditor } from "./SpendingLimitEditor";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      saveEffectiveLimit: vi.fn(),
      resetEffectiveLimit: vi.fn(),
      monthlyBreakdown: vi.fn(),
    },
  };
});
const comparison: BudgetComparison = {
  categoryId: "food",
  currency: "CHF",
  periodType: "YEAR",
  periodStart: "2026-01-01",
  source: "NORMAL",
  limit: "1200",
  actual: "20",
  remaining: "1180",
  percentage: "1.67",
  overBudget: false,
  usageStart: "2026-01-01",
  usageEnd: "2026-08-31",
  currentPeriod: true,
  available: true,
  settingReference: { id: "setting", version: 3 },
  overrideReference: null,
  accruedMonths: 0,
  coveredMonths: 0,
};
beforeEach(() => vi.resetAllMocks());
function page(value = comparison) {
  render(
    <SpendingLimitEditor
      categoryId="food"
      label="Food"
      currency="CHF"
      periodType={value.periodType}
      periodStart={value.periodStart}
      comparison={value}
      settingReference={value.settingReference}
      businessDate="2026-10-05"
      available
      onSaved={vi.fn()}
      onCancel={vi.fn()}
      onExpired={vi.fn()}
    />,
  );
}
it("edits the displayed annual period and asks whether a current edit should become normal", async () => {
  page();
  expect(screen.getByText("Only 2026")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Limit for 2026 (CHF)"), { target: { value: "1300" } });
  fireEvent.click(screen.getByLabelText("Make this the normal yearly limit"));
  fireEvent.click(screen.getByText("Save limit"));
  await waitFor(() =>
    expect(api.saveEffectiveLimit).toHaveBeenCalledWith({
      categoryId: "food",
      currency: "CHF",
      periodType: "YEAR",
      periodStart: "2026-01-01",
      limit: "1300",
      scope: "NORMAL",
      expectedSetting: { id: "setting", version: 3 },
      expectedOverride: null,
    }),
  );
});
it("past edits remain period-only and stale failures retain exact input", async () => {
  vi.mocked(api.saveEffectiveLimit).mockRejectedValue(new ApiError(412, "Stale period"));
  page({ ...comparison, periodStart: "2025-01-01", currentPeriod: false });
  expect(screen.queryByText("Apply this change")).toBeNull();
  fireEvent.change(screen.getByLabelText("Limit for 2025 (CHF)"), {
    target: { value: "100.12345678" },
  });
  fireEvent.click(screen.getByText("Save limit"));
  await screen.findByText("Stale period");
  expect(screen.getByLabelText("Limit for 2025 (CHF)")).toHaveValue("100.12345678");
  expect(screen.getByText("Save limit")).toBeDisabled();
});
it("confirms resetting an exception and retains normal and exception versions", async () => {
  page({ ...comparison, source: "EXCEPTION", overrideReference: { id: "override", version: 2 } });
  fireEvent.click(screen.getByText("Use normal limit"));
  expect(api.resetEffectiveLimit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Confirm reset"));
  await waitFor(() =>
    expect(api.resetEffectiveLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOverride: { id: "override", version: 2 },
        expectedSetting: { id: "setting", version: 3 },
      }),
    ),
  );
});
it("monthly breakdown edits individual months, including periods with no allowance", async () => {
  vi.mocked(api.monthlyBreakdown).mockResolvedValue({
    businessDate: "2026-10-05",
    setting: null,
    items: [{ periodStart: "2026-08-01", accrued: true, comparison: null }],
  });
  render(
    <MonthlyLimitBreakdown
      categoryId="food"
      label="Food"
      currency="CHF"
      year={2026}
      available
      onSaved={vi.fn()}
      onExpired={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Edit months · 2026"));
  await screen.findByText(/2026-08 · No limit/);
  fireEvent.click(screen.getByText("Edit monthly limit"));
  expect(screen.getByLabelText("Limit for 2026-08 (CHF)")).toBeVisible();
});
