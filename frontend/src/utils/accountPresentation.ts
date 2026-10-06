import type { AccountType } from "../types/models";
export const accountTypes: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CASH: "Cash",
  CREDIT_CARD: "Credit card",
  INVESTMENT: "Investment cash",
  OTHER: "Other",
};
// Round decimal strings for display only; stored values keep their original precision.
export function displayAmount(value: string) {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const digits = fraction.padEnd(3, "0");
  let cents = BigInt(whole || "0") * 100n + BigInt(digits.slice(0, 2));
  if (digits[2] >= "5") cents += 1n;
  const integer = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  const decimals = (cents % 100n).toString().padStart(2, "0");
  return `${negative && cents !== 0n ? "-" : ""}${integer}.${decimals}`;
}
