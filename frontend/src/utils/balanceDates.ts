/** Calendar arithmetic only: date-only financial values never pass through local time zones. */
export function addBalanceDays(value: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  const resultYear = date.getUTCFullYear();
  if (resultYear < 1 || resultYear > 9999) return value;
  return `${String(resultYear).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
