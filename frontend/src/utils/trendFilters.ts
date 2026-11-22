import type { TrendBucket, TrendFilters, TrendOptions } from "../types/netWorthTrend";
export const trendBuckets: TrendBucket[] = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"];
export function monthsStart(day: string, count: number): string {
  const [year, month] = day.split("-").map(Number);
  const offset = year * 12 + month - count;
  return `${Math.max(1, Math.floor(offset / 12))
    .toString()
    .padStart(4, "0")}-${(Math.max(0, offset % 12) + 1).toString().padStart(2, "0")}-01`;
}
export function readTrendFilters(options: TrendOptions): TrendFilters {
  const params = new URLSearchParams(window.location.hash.split("?")[1]);
  const bucket = params.get("bucket") as TrendBucket;
  return {
    accountIds: params.has("accountIds")
      ? params.getAll("accountIds").filter(Boolean)
      : options.accounts.filter((a) => a.active).map((a) => a.id),
    startDate: params.get("startDate") ?? monthsStart(options.businessDate, 12),
    endDate: params.get("endDate") ?? options.businessDate,
    bucket: trendBuckets.includes(bucket) ? bucket : "MONTH",
  };
}
export function trendUrl(filters: TrendFilters): string {
  const params = new URLSearchParams({
    startDate: filters.startDate,
    endDate: filters.endDate,
    bucket: filters.bucket,
  });
  if (!filters.accountIds.length) params.append("accountIds", "");
  filters.accountIds.forEach((id) => params.append("accountIds", id));
  return `#/net-worth/trends?${params.toString()}`;
}
