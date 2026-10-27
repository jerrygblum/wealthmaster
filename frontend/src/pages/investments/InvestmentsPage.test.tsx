import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { InvestmentAccount, InvestmentPreview } from "../../types/investments";
import { InvestmentActivityPage as InvestmentsPage } from "./InvestmentActivityPage";

vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: {
    investmentAccount: vi.fn(),
    account: vi.fn(),
    previewInvestment: vi.fn(),
    commitInvestment: vi.fn(),
    createSecurity: vi.fn(),
    previewInvestmentReversal: vi.fn(),
    reverseInvestment: vi.fn(),
  },
}));
const security = {
  id: "security",
  name: "Synthetic stock",
  symbol: "SYN",
  exchange: "NASDAQ",
  isin: null,
  type: "STOCK" as const,
  currency: "USD",
};
const view: InvestmentAccount = {
  accountId: "account",
  cashCurrency: "CHF",
  cashBalance: "1000",
  asOf: "2026-10-14",
  active: true,
  securities: [security],
  holdings: [],
  activities: [],
};
const preview: InvestmentPreview = {
  token: "review-token",
  errors: [],
  warnings: ["Acquisition cost is not market value."],
  gross: "500",
  cashMovement: "-455",
  cashCurrency: "CHF",
  tradeCurrency: "USD",
  availableLots: [],
  allocations: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.investmentAccount).mockResolvedValue(view);
  vi.mocked(api.account).mockResolvedValue({
    id: "account",
    name: "Synthetic broker",
    type: "INVESTMENT",
    institution: null,
    currency: "CHF",
    openingBalance: "1000",
    openingDate: "2020-01-01",
    active: true,
    createdAt: "",
    version: 0,
    hasActivity: false,
  });
  vi.mocked(api.previewInvestment).mockResolvedValue(preview);
});
async function purchase() {
  fireEvent.click(await screen.findByRole("button", { name: "Record purchase" }));
  fireEvent.change(screen.getByLabelText("Security", { exact: true }), {
    target: { value: "security" },
  });
  fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Execution unit price (USD)"), {
    target: { value: "50" },
  });
  fireEvent.change(
    screen.getByLabelText("Actual cash debit (CHF, excluding separately recorded costs)"),
    {
      target: { value: "455" },
    },
  );
  fireEvent.click(screen.getByLabelText(/I confirmed this account balance/));
  fireEvent.click(screen.getByRole("button", { name: "Preview investment activity" }));
  await screen.findByRole("region", { name: "Investment preview" });
}
it("reviews USD execution and actual CHF cash before committing a purchase", async () => {
  render(<InvestmentsPage accountId="account" onExpired={vi.fn()} />);
  await purchase();
  expect(screen.getByText(/Execution gross: USD 500/)).toHaveTextContent("Cash movement: CHF -455");
  expect(api.commitInvestment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await waitFor(() =>
    expect(api.commitInvestment).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "BUY",
        quantity: "10",
        unitPrice: "50",
        settlement: "455",
        accountId: "account",
        securityId: "security",
        cashOnlyConfirmed: true,
      }),
      "review-token",
    ),
  );
  expect(await screen.findByText(/Investment activity saved/)).toBeVisible();
});
it("requires a new preview after changes and retains failed submissions for retry", async () => {
  render(<InvestmentsPage accountId="account" onExpired={vi.fn()} />);
  await purchase();
  fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "11" } });
  expect(screen.getByRole("button", { name: "Confirm purchase" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Rebuild investment preview" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Confirm purchase" })).toBeEnabled(),
  );
  vi.mocked(api.commitInvestment).mockRejectedValue(
    new ApiError(412, "Cash changed. Rebuild the preview."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Cash changed");
  expect(screen.getByLabelText("Quantity", { exact: true })).toHaveValue("11");
});
it("supports existing holdings with unknown acquisition data and no settlement input", async () => {
  render(<InvestmentsPage accountId="account" onExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add existing holding" }));
  expect(screen.queryByLabelText(/Actual cash/)).toBeNull();
  fireEvent.change(screen.getByLabelText("Security", { exact: true }), {
    target: { value: "security" },
  });
  fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), {
    target: { value: "1.123456789012" },
  });
  fireEvent.click(screen.getByLabelText(/I confirmed this account balance/));
  fireEvent.click(screen.getByRole("button", { name: "Preview investment activity" }));
  await waitFor(() =>
    expect(api.previewInvestment).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "OPENING",
        acquisitionCost: null,
        acquiredOn: null,
        settlement: null,
        cashDate: null,
        aggregateOpening: true,
        quantity: "1.123456789012",
      }),
    ),
  );
});
it("shows unknown-cost holdings and disables writes to archived accounts", async () => {
  vi.mocked(api.investmentAccount).mockResolvedValue({
    ...view,
    active: false,
    holdings: [
      { security, quantity: "2", knownCost: "0", costComplete: false, averageCost: null, lots: [] },
    ],
  });
  render(<InvestmentsPage accountId="account" onExpired={vi.fn()} />);
  expect(await screen.findByText(/incomplete; some costs unknown/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Record purchase" })).toBeDisabled();
  expect(screen.getByText("Unknown", { exact: true })).toBeVisible();
});
it("keeps a sale allocation editable and requires rebuilding after overriding a lot", async () => {
  vi.mocked(api.previewInvestment).mockResolvedValue({
    ...preview,
    cashMovement: "160",
    gross: "180",
    availableLots: [
      {
        id: "lot",
        activityId: "opening",
        securityId: security.id,
        date: "2024-01-01",
        acquiredOn: null,
        aggregateOpening: true,
        quantity: "10",
        remaining: "10",
        remainingCost: null,
      },
    ],
    allocations: [{ lotId: "lot", quantity: "3", cashCost: null }],
  });
  render(<InvestmentsPage accountId="account" onExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Record sale" }));
  fireEvent.change(screen.getByLabelText("Security", { exact: true }), {
    target: { value: "security" },
  });
  fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Execution unit price (USD)"), {
    target: { value: "60" },
  });
  fireEvent.change(
    screen.getByLabelText("Actual cash credit (CHF, excluding separately recorded costs)"),
    {
      target: { value: "160" },
    },
  );
  fireEvent.click(screen.getByLabelText(/I confirmed this account balance/));
  fireEvent.click(screen.getByRole("button", { name: "Preview investment activity" }));
  const allocation = await screen.findByLabelText("Sell quantity from lot lot");
  fireEvent.change(allocation, { target: { value: "2" } });
  expect(screen.getByRole("button", { name: "Confirm sale" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Rebuild investment preview" }));
  await waitFor(() =>
    expect(api.previewInvestment).toHaveBeenLastCalledWith(
      expect.objectContaining({ allocations: [{ lotId: "lot", quantity: "2" }] }),
    ),
  );
});
