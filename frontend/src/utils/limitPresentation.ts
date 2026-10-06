import type { BudgetMode } from "../types/models";

// Presentation conversion only. The backend owns persisted amounts and comparisons.
export function convertLimit(value: string, from: BudgetMode, to: BudgetMode) {
  if (!value || from === "NONE" || to === "NONE" || from === to) return value;
  if (!/^[0-9]{1,21}([.][0-9]{1,8})?$/.test(value)) return "";
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
  const result = to === "YEAR" ? units * 12n : (units + 6n) / 12n;
  const digits = (result % 100000000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${result / 100000000n}${digits ? `.${digits}` : ""}`;
}
