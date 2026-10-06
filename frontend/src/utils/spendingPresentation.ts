import type { SpendingAmounts } from "../types/models";
export const zero: SpendingAmounts = { expenses: "0", refunds: "0", netSpending: "0" };
export const nonzero = (s: string) => /[1-9]/.test(s);
export const colors = ["#2563eb", "#047857", "#92400e", "#7e22ce", "#b91c1c", "#0e7490", "#475569"];
export function fractions(values: string[]) {
  const numbers = values.map((s) =>
    BigInt(s.split(".")[0] + (s.split(".")[1] || "").padEnd(8, "0")),
  );
  const total = numbers.reduce((a, b) => a + b, 0n);
  return numbers.map((n) => (total ? Number((n * 1000000000n) / total) / 1000000000 : 0));
}

export const spendingBranchId = (currency: string, id: string | null) =>
  `spending-${currency}-${id || "uncategorized"}`;
