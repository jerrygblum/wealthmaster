export type User = { id: string; email: string };
export type Session =
  | { status: "AUTHENTICATED"; user: User; recoveryUsed?: boolean }
  | { status: "MFA_REQUIRED"; user?: User }
  | { status: "MFA_SETUP_REQUIRED"; user: User };
export type FactorKind = "TOTP" | "RECOVERY";
export type MfaOperation = "ENROLL" | "REPLACE" | "RECOVERY";
export type SecurityStatus = {
  enabled: boolean;
  required: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  pendingOperation: MfaOperation | null;
};
export type MfaSetup = {
  setupKey: string | null;
  otpauthUri: string | null;
  expiresAt: string;
  recoveryCodes: string[] | null;
};
export type RecoveryCodes = { recoveryCodes: string[]; expiresAt: string };
export type AccountType = "CHECKING" | "SAVINGS" | "CASH" | "CREDIT_CARD" | "INVESTMENT" | "OTHER";
export type BalanceMeaning = "BALANCE" | "AMOUNT_OWED" | "IN_CREDIT";
export type FinancialAccount = {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  currentBalance?: string;
  balanceAsOf?: string;
  openingBalance: string;
  openingDate: string;
  active: boolean;
  createdAt: string;
  version: number;
  hasActivity: boolean;
};
export type CreateAccount = {
  name: string;
  type: AccountType;
  institution: string;
  currency: string;
  openingAmount: string;
  openingDate: string;
  balanceMeaning: BalanceMeaning;
};
export type CategoryType = "INCOME" | "SPENDING";
export type CategoryInput = {
  normalLimit?: {
    mode: BudgetMode;
    limit: string | null;
    expected: BudgetReference | null;
    expectedPreferencesVersion: number;
  };
  name: string;
  type: CategoryType;
  parentId: string | null;
};
export type Category = CategoryInput & {
  id: string;
  active: boolean;
  createdAt: string;
  version: number;
  hasActivity: boolean;
  hasChildren: boolean;
  available: boolean;
};
export type CategoryList = { items: Category[]; starterSetAvailable: boolean };
export type LedgerKind = "INCOME" | "EXPENSE" | "REFUND" | "TRANSFER";
export type LedgerInput = {
  accountId: string;
  kind: LedgerKind;
  amount: string;
  transactionDate: string;
  valueDate: string | null;
  payee: string;
  description: string;
  notes: string;
  destinationAccountId?: string;
  categoryId?: string | null;
};
export type Operation = LedgerInput & {
  id: string;
  currency: string;
  version: number;
  createdAt: string;
  category?: { id: string; name: string; parentName: string | null; available: boolean } | null;
};
export type NetWorthTotals = { assets: string; liabilities: string; netWorth: string };
export type CurrentNetWorth = {
  balanceAsOf: string;
  calculatedAt: string;
  currencies: (NetWorthTotals & {
    currency: string;
    byAccountType: (NetWorthTotals & { type: AccountType })[];
  })[];
  accounts: (Pick<FinancialAccount, "id" | "name" | "type" | "currency" | "active"> & {
    currentBalance: string;
  })[];
  excludedFutureAccounts: Pick<
    FinancialAccount,
    "id" | "name" | "type" | "currency" | "active" | "openingDate"
  >[];
};
export type SpendingAmounts = { expenses: string; refunds: string; netSpending: string };
export type SpendingReport = {
  defaultCurrency: string | null;
  periodType: BudgetPeriod;
  periodStart: string;
  categories: Category[];
  groups: {
    categoryId: string | null;
    currency: string;
    direct: SpendingAmounts;
    inclusive: SpendingAmounts;
  }[];
  currencies: (SpendingAmounts & { currency: string; uncategorized: string; unbudgeted: string })[];
  limits: BudgetComparison[];
  businessDate: string;
};
export type BudgetReference = { id: string; version: number };
export type BudgetMode = "NONE" | "MONTH" | "YEAR";
export type BudgetSetting = {
  id: string;
  categoryId: string;
  currency: string;
  mode: BudgetMode;
  limit: string | null;
  version: number;
  monthlyLimit: string | null;
  yearlyLimit: string | null;
};
export type BudgetSettings = { businessDate: string; items: BudgetSetting[] };
export type BudgetComparison = {
  categoryId: string;
  currency: string;
  periodType: BudgetPeriod;
  periodStart: string;
  limit: string;
  actual: string;
  remaining: string;
  percentage: string | null;
  overBudget: boolean;
  available: boolean;
};
export type BudgetPeriod = "MONTH" | "YEAR";

export type Preferences = {
  defaultCurrency: string | null;
  version: number;
  hasLimitsToReset: boolean;
};
