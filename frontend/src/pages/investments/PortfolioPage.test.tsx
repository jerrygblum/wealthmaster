import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import { InvestmentsPage } from "./InvestmentsPage";
import type { FinancialAccount } from "../../types/models";
import type { InvestmentAccount, InvestmentActivity } from "../../types/investments";
vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: {
    account: vi.fn(),
    investmentAccount: vi.fn(),
    searchStocks: vi.fn(),
    addMarketSecurity: vi.fn(),
    linkMarketSecurity: vi.fn(),
    refreshMarketPrices: vi.fn(),
    previewInvestment: vi.fn(),
    commitInvestment: vi.fn(),
    createSecurity: vi.fn(),
    navHistory: vi.fn(),
    recordNav: vi.fn(),
  },
}));
const security = {
  id: "stock",
  name: "Synthetic stock",
  symbol: "SYN",
  exchange: "SYNTHETIC",
  currency: "USD",
  type: "STOCK" as const,
  isin: null,
};
const view: InvestmentAccount = {
  accountId: "broker",
  cashCurrency: "CHF",
  cashBalance: "1000",
  asOf: "2026-10-14",
  active: true,
  securities: [security],
  activities: [],
  holdings: [
    { security, quantity: "2.5", knownCost: "0", costComplete: false, averageCost: null, lots: [] },
  ],
};
const account: FinancialAccount = {
  id: "broker",
  name: "Synthetic broker",
  type: "INVESTMENT",
  institution: null,
  currency: "CHF",
  openingBalance: "1000",
  currentBalance: "1000",
  openingDate: "2020-01-01",
  active: true,
  createdAt: "",
  version: 0,
  hasActivity: true,
  valuation: {
    currency: "CHF",
    cash: "1000",
    holdingsValue: "225",
    totalValue: "1225",
    unvaluedHoldings: 0,
    stale: false,
    holdings: [
      {
        securityId: "stock",
        name: "Synthetic stock",
        symbol: "SYN",
        quantity: "2.5",
        currency: "USD",
        price: "100",
        previousClose: "99",
        changePercent: "1.0101",
        series: [
          { at: "2026-10-13T15:00:00Z", close: "99" },
          { at: "2026-10-14T15:00:00Z", close: "100" },
        ],
        quotedAt: "2026-10-14T15:00:00Z",
        fetchedAt: "2026-10-14T16:00:00Z",
        source: "YAHOO",
        nativeValue: "250",
        fxRate: "0.9",
        fxQuotedAt: "2026-10-14T15:00:00Z",
        accountValue: "225",
        stale: false,
      },
    ],
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.account).mockResolvedValue(account);
  vi.mocked(api.investmentAccount).mockResolvedValue(view);
});
const renderPage = () => render(<InvestmentsPage accountId="broker" onExpired={vi.fn()} />);
it("opens on holdings, shows converted account value, previous close and trend", async () => {
  renderPage();
  expect(await screen.findByText("CHF 1’225.00")).toBeVisible();
  expect(screen.getByText("USD 100.00")).toBeVisible();
  expect(screen.getByText("Previous close: USD 99.00")).toBeVisible();
  expect(screen.getByRole("img", { name: /daily price trend/ })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cash activity / record costs" })).toHaveAttribute(
    "href",
    "#/accounts/broker",
  );
  expect(screen.queryByText("Acquisition cost")).not.toBeInTheDocument();
});
it("records exact existing shares without cash or acquisition-cost inputs", async () => {
  vi.mocked(api.previewInvestment).mockResolvedValue({
    token: "review",
    errors: [],
    warnings: [],
    gross: null,
    cashMovement: "0",
    cashCurrency: "CHF",
    tradeCurrency: "USD",
    availableLots: [],
    allocations: [],
  });
  vi.mocked(api.commitInvestment).mockResolvedValue({} as InvestmentActivity);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Add holding" }));
  fireEvent.change(screen.getByLabelText("Selected stock, ETF or fund"), {
    target: { value: "stock" },
  });
  fireEvent.change(screen.getByLabelText("Shares to add"), { target: { value: "0.123456789012" } });
  fireEvent.click(screen.getByRole("button", { name: "Save holding" }));
  await screen.findByText(/Holding added. Cash is unchanged/);
  expect(api.commitInvestment).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "OPENING",
      quantity: "0.123456789012",
      settlement: null,
      acquisitionCost: null,
      charges: [],
    }),
    "review",
  );
});
it("lets the user explicitly choose an online listing before creating a security", async () => {
  vi.mocked(api.searchStocks).mockResolvedValue([
    { symbol: "SYN", name: "Synthetic stock", exchange: "SYNTHETIC", type: "STOCK" },
  ]);
  vi.mocked(api.addMarketSecurity).mockResolvedValue(security);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Add holding" }));
  fireEvent.change(screen.getByLabelText("Find stock or ETF"), { target: { value: "synthetic" } });
  fireEvent.click(screen.getByRole("button", { name: "Search online" }));
  await screen.findByRole("button", { name: /Synthetic stock · SYN · SYNTHETIC · STOCK/ });
  expect(api.addMarketSecurity).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /Synthetic stock · SYN · SYNTHETIC · STOCK/ }),
  );
  await waitFor(() => expect(api.addMarketSecurity).toHaveBeenCalledWith("SYN"));
  expect(await screen.findByLabelText("Selected stock, ETF or fund")).toHaveValue("stock");
});
it("keeps input and saved holdings when online lookup fails", async () => {
  vi.mocked(api.searchStocks).mockRejectedValue(new ApiError(502, "Source unavailable"));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Add holding" }));
  fireEvent.change(screen.getByLabelText("Find stock or ETF"), { target: { value: "synthetic" } });
  fireEvent.click(screen.getByRole("button", { name: "Search online" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Find stock or ETF")).toHaveValue("synthetic");
  expect(screen.getByText("CHF 1’225.00")).toBeVisible();
});
it("marks missing FX as unvalued and archived accounts as read-only", async () => {
  vi.mocked(api.investmentAccount).mockResolvedValue({ ...view, active: false });
  vi.mocked(api.account).mockResolvedValue({
    ...account,
    valuation: {
      ...account.valuation!,
      totalValue: "1000",
      holdingsValue: "0",
      unvaluedHoldings: 1,
      holdings: [{ ...account.valuation!.holdings[0], accountValue: null, fxRate: null }],
    },
  });
  renderPage();
  await screen.findByText("Known account value (incomplete)");
  expect(screen.getByText("Not valued")).toBeVisible();
  expect(screen.getByRole("button", { name: "Add holding" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh prices" })).toBeDisabled();
});
it("refreshes prices explicitly and preserves provider messages", async () => {
  vi.mocked(api.refreshMarketPrices).mockResolvedValue({
    messages: ["Saved prices retained; source unavailable."],
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Refresh prices" }));
  await screen.findByText("Saved prices retained; source unavailable.");
  expect(api.refreshMarketPrices).toHaveBeenCalledWith("broker");
});

const fund = {
  id: "fund",
  name: "Synthetic Swiss fund",
  symbol: "CH0000000007",
  exchange: "NAV",
  currency: "CHF",
  type: "FUND" as const,
  isin: "CH0000000007",
};
const navEntry = {
  id: "nav",
  securityId: "fund",
  date: "2026-10-12",
  nav: "100.12345",
  currency: "CHF",
  recordedAt: "2026-10-14T12:00:00Z",
  reference: "Synthetic publication",
};
function fundView(active = true) {
  vi.mocked(api.investmentAccount).mockResolvedValue({
    ...view,
    active,
    securities: [fund],
    holdings: [{ ...view.holdings[0], security: fund }],
  });
  vi.mocked(api.account).mockResolvedValue({
    ...account,
    valuation: {
      ...account.valuation!,
      holdingsValue: "250.308625",
      totalValue: "1250.308625",
      holdings: [
        {
          ...account.valuation!.holdings[0],
          securityId: "fund",
          name: fund.name,
          symbol: fund.isin,
          currency: "CHF",
          price: "100.12345",
          previousClose: "99",
          source: "MANUAL_NAV",
          nativeValue: "250.308625",
          accountValue: "250.308625",
          fxRate: "1",
          fxQuotedAt: null,
          quotedAt: null,
          navDate: "2026-10-12",
          navHistory: [
            { date: "2026-10-11", nav: "99" },
            { date: "2026-10-12", nav: "100.12345" },
          ],
          reference: "Synthetic publication",
        },
      ],
    },
  });
  vi.mocked(api.navHistory).mockResolvedValue([navEntry]);
}
it("creates an ISIN-identified fund without requesting an online quote", async () => {
  vi.mocked(api.createSecurity).mockResolvedValue(fund);
  vi.mocked(api.investmentAccount).mockResolvedValue({ ...view, securities: [fund] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Add fund by ISIN" }));
  fireEvent.change(screen.getByLabelText("Fund name"), { target: { value: fund.name } });
  fireEvent.change(screen.getByLabelText("Fund ISIN"), {
    target: { value: fund.isin.toLowerCase() },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create fund" }));
  await screen.findByText(/Fund created/);
  expect(api.createSecurity).toHaveBeenCalledWith({
    name: fund.name,
    isin: fund.isin,
    currency: "CHF",
    symbol: fund.isin,
    exchange: "NAV",
    type: "FUND",
  });
  expect(screen.getByLabelText("Selected stock, ETF or fund")).toHaveValue("fund");
  expect(screen.getByLabelText("Units to add")).toBeVisible();
  expect(api.searchStocks).not.toHaveBeenCalled();
  expect(api.addMarketSecurity).not.toHaveBeenCalled();
});
it("shows full NAV precision, its business date, provenance and collected history", async () => {
  fundView();
  renderPage();
  await screen.findByText("CHF 100.12345");
  expect(screen.getByText("2026-10-12")).toBeVisible();
  expect(screen.getByText("Source: Synthetic publication")).toBeVisible();
  expect(screen.getByRole("img", { name: /manual NAV history/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Update NAV / history" }));
  await screen.findByRole("heading", { name: "NAV history" });
  await screen.findByText("Synthetic publication");
  expect(screen.getByLabelText("NAV valuation date")).toHaveValue("");
  expect(api.navHistory).toHaveBeenCalledWith("fund");
});
it("retains manual NAV input and request ID after a failed save, then refreshes the history", async () => {
  fundView();
  vi.mocked(api.recordNav).mockRejectedValueOnce(new ApiError(503, "Try again"));
  vi.mocked(api.recordNav).mockResolvedValueOnce(navEntry);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Update NAV / history" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save NAV" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Published NAV per unit (CHF)"), {
    target: { value: "123.123456789012" },
  });
  fireEvent.change(screen.getByLabelText("NAV valuation date"), {
    target: { value: "2026-10-13" },
  });
  fireEvent.change(screen.getByLabelText("Source reference (optional)"), {
    target: { value: "Synthetic NAV bulletin" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save NAV" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Published NAV per unit (CHF)")).toHaveValue("123.123456789012");
  fireEvent.click(screen.getByRole("button", { name: "Save NAV" }));
  await screen.findByText(/NAV saved. Fund value and net worth updated/);
  expect(api.recordNav).toHaveBeenNthCalledWith(
    1,
    "fund",
    expect.objectContaining({
      accountId: "broker",
      nav: "123.123456789012",
      date: "2026-10-13",
      reference: "Synthetic NAV bulletin",
    }),
  );
  expect(vi.mocked(api.recordNav).mock.calls[0][1].requestId).toBe(
    vi.mocked(api.recordNav).mock.calls[1][1].requestId,
  );
});
it("allows archived fund history review but offers no NAV write form", async () => {
  fundView(false);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "NAV history" }));
  await screen.findByText("Synthetic publication");
  expect(screen.queryByRole("button", { name: "Save NAV" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Published NAV per unit (CHF)")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add fund by ISIN" })).toBeDisabled();
});
