import type { AccountBalance } from "../types/accountBalance";
export function balanceFixture(patch: Partial<AccountBalance> = {}): AccountBalance {
  return {
    accountId: "a",
    accountName: "Synthetic cash",
    accountType: "CASH",
    currency: "CHF",
    active: true,
    openingDate: "2020-01-01",
    date: "2026-11-09",
    businessDate: "2026-11-09",
    calculatedAt: "2026-11-09T12:00:00Z",
    available: true,
    openingBalance: "100",
    currentBalance: "100",
    recordedBalance: "100",
    recordedChange: "0",
    forecast: null,
    entries: [],
    page: 0,
    hasMore: false,
    ...patch,
  };
}
