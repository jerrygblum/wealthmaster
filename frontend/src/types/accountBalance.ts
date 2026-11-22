import type { AccountType } from "./models";
export type BalanceEntry = {
  id: string;
  date: string;
  description: string;
  amount: string;
  source: "RECORDED" | "EXPECTED";
  kind: string;
  operationId: string | null;
  expectationId: string | null;
};
export type AccountBalance = {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  active: boolean;
  openingDate: string;
  date: string;
  businessDate: string;
  calculatedAt: string;
  available: boolean;
  openingBalance: string;
  currentBalance: string;
  recordedBalance: string | null;
  recordedChange: string | null;
  forecast: {
    adjustment: string;
    balance: string;
    complete: boolean;
    overdueCount: number;
    reviews: { expectationId: string; name: string; month: string; reason: string }[];
  } | null;
  entries: BalanceEntry[];
  page: number;
  hasMore: boolean;
};
