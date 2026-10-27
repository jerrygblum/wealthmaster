export type InvestmentKind = "OPENING" | "BUY" | "SELL";
export type SecurityInput = {
  name: string;
  symbol: string;
  exchange: string;
  isin: string | null;
  type: "STOCK" | "ETF" | "FUND";
  currency: string;
};
export type Security = SecurityInput & { id: string };
export type InvestmentCharge = { type: "FEE" | "TAX"; amount: string; currency: string };
export type InvestmentInput = {
  requestId: string;
  accountId: string;
  securityId: string;
  kind: InvestmentKind;
  quantity: string;
  unitPrice: string | null;
  tradeDate: string;
  cashDate: string | null;
  acquiredOn: string | null;
  settlement: string | null;
  acquisitionCost: string | null;
  aggregateOpening: boolean;
  charges: InvestmentCharge[];
  reference: string;
  notes: string;
  cashOnlyConfirmed: boolean;
  allocations: { lotId: string; quantity: string }[] | null;
};
export type InvestmentActivity = Omit<
  InvestmentInput,
  "requestId" | "cashOnlyConfirmed" | "allocations"
> & {
  id: string;
  gross: string | null;
  cashCurrency: string;
  tradeCurrency: string;
  allocations?: { lotId: string; quantity: string; cashCost: string | null }[];
  cashOperationId: string | null;
  version: number;
  reversed: boolean;
  createdAt: string;
};
export type InvestmentLot = {
  id: string;
  activityId: string;
  securityId: string;
  date: string;
  acquiredOn: string | null;
  aggregateOpening: boolean;
  quantity: string;
  remaining: string;
  remainingCost: string | null;
};
export type Holding = {
  security: Security;
  quantity: string;
  knownCost: string;
  costComplete: boolean;
  averageCost: string | null;
  lots: InvestmentLot[];
};
export type InvestmentAccount = {
  accountId: string;
  cashCurrency: string;
  cashBalance: string;
  asOf: string;
  active: boolean;
  securities: Security[];
  holdings: Holding[];
  activities: InvestmentActivity[];
};
export type InvestmentPreview = {
  token: string;
  errors: string[];
  warnings: string[];
  gross: string | null;
  cashMovement: string;
  cashCurrency: string;
  tradeCurrency: string;
  availableLots: InvestmentLot[];
  allocations: { lotId: string; quantity: string; cashCost: string | null }[];
};
export type InvestmentReversal = { token: string; errors: string[]; cashMovement: string };
