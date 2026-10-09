import type { SpendingAmounts } from "../types/models";
export const zero: SpendingAmounts = { expenses: "0", refunds: "0", netSpending: "0" };
export const nonzero = (s: string) => /[1-9]/.test(s);
export const spendingBranchId = (currency: string, id: string | null) =>
  `spending-${currency}-${id || "uncategorized"}`;
