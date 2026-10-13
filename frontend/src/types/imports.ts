import type { CreateAccount, CategoryInput, FinancialAccount, Category } from "./models";
export type SourceCell = { value: string; formula: string; type: string };
export type SourceRow = { number: number; cells: Record<string, SourceCell> };
export type ImportSelection = { sheet: string; headerRow: number; columns: Record<string, string> };
export type ImportAccount = {
  key: string;
  existingId: string | null;
  version: number | null;
  create: CreateAccount | null;
  closingBalance: string;
};
export type ImportCategory = {
  key: string;
  existingId: string | null;
  version: number | null;
  create: CategoryInput | null;
  parentKey: string | null;
};
export type ImportDecision = {
  row: number;
  include: boolean;
  reason: string;
  date: string;
  kind: string;
  account: string;
  card: string;
  category: string;
  amount: string;
  description: string;
  partner: number | null;
};
export type DuplicateChoice = {
  mode: "KEEP" | "LINK";
  existingId: string | null;
  version: number | null;
};
export type ImportPlan = {
  selection: ImportSelection;
  start: string;
  end: string;
  accounts: ImportAccount[];
  categories: ImportCategory[];
  rows: ImportDecision[];
  duplicates: Record<string, DuplicateChoice>;
};
export type ImportReceipt = {
  batchId: string;
  createdOperations: number;
  linkedOperations: number;
  createdAccounts: Record<string, string>;
  createdCategories: Record<string, string>;
  committedAt: string;
};
export type ImportBatch = {
  id: string;
  status: "DRAFT" | "COMMITTED" | "REVERSED";
  version: number;
  createdAt: string;
  workbook: { date1904: boolean; sheets: { name: string; rows: SourceRow[] }[] } | null;
  plan: ImportPlan | null;
  receipt: ImportReceipt | null;
};
export type ImportSummary = Pick<ImportBatch, "id" | "status" | "version" | "createdAt">;
export type ImportOperation = {
  key: string;
  kind: string;
  account: string;
  destination: string | null;
  category: string | null;
  amount: string;
  currency: string;
  date: string;
  description: string;
  reconstructed: boolean;
  rows: number[];
};
export type ImportCandidate = {
  id: string;
  version: number;
  kind: string;
  amount: string;
  date: string;
  description: string;
};
export type ImportPreview = {
  version: number;
  token: string;
  errors: string[];
  warnings: string[];
  operations: ImportOperation[];
  duplicates: Record<string, ImportCandidate[]>;
  balances: {
    key: string;
    name: string;
    currency: string;
    opening: string;
    existingMovements: string;
    importedMovements: string;
    projectedClosing: string;
    expectedClosing: string | null;
    difference: string | null;
  }[];
  totals: Record<string, string>;
  excluded: number[];
};
export type ImportUndo = { version: number; errors: string[]; operations: number };
export type ImportResources = { accounts: FinancialAccount[]; categories: Category[] };
