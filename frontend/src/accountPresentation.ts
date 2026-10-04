import type { AccountType } from "./api";
export const accountTypes: Record<AccountType, string> = {
  CHECKING: "Checking", SAVINGS: "Savings", CASH: "Cash", CREDIT_CARD: "Credit card", INVESTMENT: "Investment cash", OTHER: "Other",
};
// Format native decimal strings without converting financial values to binary floating point.
export function displayAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}${decimals ? `.${decimals}` : ""}`;
}
