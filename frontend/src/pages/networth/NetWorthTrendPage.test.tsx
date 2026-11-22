import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NetWorthTrendPage } from "./NetWorthTrendPage";
import { api, ApiError } from "../../services/api";
import type { NetWorthTrend, TrendAccount, TrendFilters } from "../../types/netWorthTrend";
vi.mock("../../services/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../services/api")>();
  return { ...original, api: { ...original.api, trendOptions: vi.fn(), netWorthTrend: vi.fn() } };
});
const accounts: TrendAccount[] = [
  {
    id: "a",
    name: "Synthetic bank",
    type: "CHECKING",
    currency: "CHF",
    active: true,
    openingDate: "2020-01-01",
  },
  {
    id: "b",
    name: "Synthetic old card",
    type: "CREDIT_CARD",
    currency: "CHF",
    active: false,
    openingDate: "2019-01-01",
  },
  {
    id: "c",
    name: "Synthetic euro",
    type: "CASH",
    currency: "EUR",
    active: true,
    openingDate: "2022-01-01",
  },
];
function report(filters: TrendFilters): NetWorthTrend {
  const selected = accounts.filter((a) => filters.accountIds.includes(a.id));
  return {
    ...filters,
    businessDate: "2026-10-31",
    calculatedAt: "2026-10-31T12:00:00Z",
    accounts: selected,
    points: [
      {
        period: { startDate: filters.startDate, endDate: filters.endDate, partial: true },
        accounts: selected.map((a) => ({
          accountId: a.id,
          opened: true,
          value: "100.12345678",
          knownSubtotal: "100.12345678",
          missingPositions: 0,
          stale: false,
          sources: [],
        })),
        currencies: [...new Set(selected.map((a) => a.currency))].map((currency) => ({
          currency,
          value: "100.12345678",
          knownSubtotal: "100.12345678",
          missingPositions: 0,
          stale: false,
        })),
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "#/net-worth/trends");
  vi.mocked(api.trendOptions).mockResolvedValue({ businessDate: "2026-10-31", accounts });
  vi.mocked(api.netWorthTrend).mockImplementation((filters) => Promise.resolve(report(filters)));
});
it("defaults to active accounts and twelve calendar months, with separate currency charts and optional lines", async () => {
  render(<NetWorthTrendPage onExpired={vi.fn()} />);
  await screen.findByRole("region", { name: "CHF net-worth trend" });
  expect(api.netWorthTrend).toHaveBeenCalledWith({
    accountIds: ["a", "c"],
    startDate: "2025-11-01",
    endDate: "2026-10-31",
    bucket: "MONTH",
  });
  expect(screen.getByLabelText(/Synthetic old card/)).not.toBeChecked();
  expect(screen.getByRole("region", { name: "EUR net-worth trend" })).toBeVisible();
  const chart = screen.getByRole("group", { name: "CHF net-worth trend chart" });
  expect(within(chart).queryByRole("img", { name: /Synthetic bank/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Show account lines"));
  expect(within(chart).getByRole("img", { name: /Synthetic bank/ })).toHaveAttribute(
    "tabindex",
    "0",
  );
  expect(screen.getAllByRole("table")).toHaveLength(2);
});
it("applies account and bucket choices explicitly, saves URL filters and restores them on reload", async () => {
  render(<NetWorthTrendPage onExpired={vi.fn()} />);
  await screen.findByRole("region", { name: "CHF net-worth trend" });
  fireEvent.click(screen.getByText("Accounts", { exact: true }).closest("summary")!);
  const calls = vi.mocked(api.netWorthTrend).mock.calls.length;
  fireEvent.click(screen.getByLabelText(/Synthetic old card/));
  fireEvent.change(screen.getByLabelText("Time buckets"), { target: { value: "WEEK" } });
  fireEvent.click(screen.getByRole("button", { name: "All history" }));
  expect(api.netWorthTrend).toHaveBeenCalledTimes(calls);
  expect(screen.getByLabelText("Start date")).toHaveValue("2019-01-01");
  fireEvent.click(screen.getByRole("button", { name: "Update trend" }));
  await waitFor(() => expect(window.location.hash).toContain("bucket=WEEK"));
  expect(window.location.hash).toContain("accountIds=b");
});
it("restores a single-account query without selecting the other active accounts", async () => {
  window.history.replaceState(
    null,
    "",
    "#/net-worth/trends?accountIds=b&startDate=2024-01-01&endDate=2024-06-30&bucket=QUARTER",
  );
  render(<NetWorthTrendPage onExpired={vi.fn()} />);
  await screen.findByRole("region", { name: "CHF net-worth trend" });
  expect(api.netWorthTrend).toHaveBeenCalledWith({
    accountIds: ["b"],
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    bucket: "QUARTER",
  });
  expect(screen.getByLabelText(/Synthetic old card/)).toBeChecked();
  expect(screen.queryByRole("region", { name: "EUR net-worth trend" })).not.toBeInTheDocument();
});
it("shows incomplete known subtotals and older sources without a misleading complete chart", async () => {
  vi.mocked(api.netWorthTrend).mockImplementation((filters) => {
    const result = report(filters);
    result.points[0].accounts.forEach((a) => {
      a.value = null;
      a.missingPositions = 1;
      a.stale = true;
      a.sources = [
        {
          securityId: "synthetic-security",
          securityName: "Synthetic security",
          currency: "USD",
          priceDate: null,
          quotedAt: null,
          fetchedAt: null,
          source: null,
          stale: false,
          missing: true,
        },
      ];
    });
    result.points[0].currencies.forEach((c) => {
      c.value = null;
      c.missingPositions = 1;
      c.stale = true;
    });
    return Promise.resolve(result);
  });
  render(<NetWorthTrendPage onExpired={vi.fn()} />);
  await screen.findAllByText(/No complete valuation/);
  expect(screen.getAllByText(/Incomplete · known subtotal/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Missing price \/ FX/).length).toBeGreaterThan(0);
  expect(
    screen.queryByRole("group", { name: "CHF net-worth trend chart" }),
  ).not.toBeInTheDocument();
});
it("keeps a failed refresh explicitly out of date and supports retry", async () => {
  render(<NetWorthTrendPage onExpired={vi.fn()} />);
  await screen.findByRole("region", { name: "CHF net-worth trend" });
  vi.mocked(api.netWorthTrend).mockRejectedValueOnce(new Error("Synthetic unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Update trend" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("out of date");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
it("clears selected accounts without requesting a total and handles no-account owners", async () => {
  const view = render(<NetWorthTrendPage onExpired={vi.fn()} />);
  await screen.findByRole("region", { name: "CHF net-worth trend" });
  fireEvent.click(screen.getByText("Accounts", { exact: true }).closest("summary")!);
  const calls = vi.mocked(api.netWorthTrend).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  fireEvent.click(screen.getByRole("button", { name: "Update trend" }));
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "CHF net-worth trend" })).not.toBeInTheDocument(),
  );
  expect(api.netWorthTrend).toHaveBeenCalledTimes(calls);
  view.unmount();
  vi.mocked(api.trendOptions).mockResolvedValue({ businessDate: "2026-10-31", accounts: [] });
  render(<NetWorthTrendPage onExpired={vi.fn()} />);
  expect(await screen.findByText(/No accounts yet/)).toBeVisible();
});
it("expires unauthorized sessions", async () => {
  vi.mocked(api.trendOptions).mockRejectedValue(new ApiError(401, "Expired"));
  const expire = vi.fn();
  render(<NetWorthTrendPage onExpired={expire} />);
  await waitFor(() => expect(expire).toHaveBeenCalled());
});
