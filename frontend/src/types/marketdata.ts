export type Listing = { symbol: string; name: string; exchange: string; type: string };
export type PricePoint = { at: string; close: string };
export type HoldingValue = {
  securityId: string;
  name: string;
  symbol: string;
  quantity: string;
  currency: string;
  price: string | null;
  previousClose: string | null;
  changePercent: string | null;
  series: PricePoint[];
  quotedAt: string | null;
  fetchedAt: string | null;
  source: string | null;
  nativeValue: string | null;
  fxRate: string | null;
  fxQuotedAt: string | null;
  accountValue: string | null;
  stale: boolean;
  navDate?: string | null;
  navHistory?: { date: string; nav: string }[];
  reference?: string | null;
};
export type Valuation = {
  currency: string;
  cash: string;
  holdingsValue: string;
  totalValue: string;
  unvaluedHoldings: number;
  stale: boolean;
  holdings: HoldingValue[];
};

export type NavInput = {
  requestId: string;
  accountId: string;
  date: string;
  nav: string;
  reference: string;
};
export type NavEntry = {
  id: string;
  securityId: string;
  date: string;
  nav: string;
  currency: string;
  recordedAt: string;
  reference: string | null;
};
