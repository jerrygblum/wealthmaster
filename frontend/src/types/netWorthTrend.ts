import type { AccountType } from "./models";
export type TrendBucket = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export type TrendAccount = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingDate: string;
  active: boolean;
};
export type TrendOptions = { businessDate: string; accounts: TrendAccount[] };
export type TrendFilters = {
  accountIds: string[];
  startDate: string;
  endDate: string;
  bucket: TrendBucket;
};
export type TrendSource = {
  securityId: string;
  securityName: string;
  currency: string;
  priceDate: string | null;
  quotedAt: string | null;
  fetchedAt: string | null;
  source: string | null;
  stale: boolean;
  missing: boolean;
};
export type TrendValue = {
  accountId: string;
  opened: boolean;
  value: string | null;
  knownSubtotal: string | null;
  missingPositions: number;
  stale: boolean;
  sources: TrendSource[];
};
export type TrendTotal = {
  currency: string;
  value: string | null;
  knownSubtotal: string | null;
  missingPositions: number;
  stale: boolean;
};
export type TrendPoint = {
  period: { startDate: string; endDate: string; partial: boolean };
  accounts: TrendValue[];
  currencies: TrendTotal[];
};
export type NetWorthTrend = Omit<TrendFilters, "accountIds"> & {
  businessDate: string;
  calculatedAt: string;
  accounts: TrendAccount[];
  points: TrendPoint[];
};
export type TrendModel = {
  options?: TrendOptions;
  report?: NetWorthTrend;
  filters?: TrendFilters;
  loading: boolean;
  error: string;
  showAccounts: boolean;
  change: (patch: Partial<TrendFilters>) => void;
  setShowAccounts: (value: boolean) => void;
  preset: (value: string) => void;
  update: () => Promise<void>;
  retry: () => void;
};
