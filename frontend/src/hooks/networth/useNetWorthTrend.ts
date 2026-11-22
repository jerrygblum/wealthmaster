import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import { monthsStart, readTrendFilters, trendUrl } from "../../utils/trendFilters";
import type {
  NetWorthTrend,
  TrendFilters,
  TrendModel,
  TrendOptions,
} from "../../types/netWorthTrend";

export function useNetWorthTrend(onExpired: () => void): TrendModel {
  const [options, setOptions] = useState<TrendOptions>();
  const [filters, setFilters] = useState<TrendFilters>();
  const [report, setReport] = useState<NetWorthTrend>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAccounts, setShowAccounts] = useState(false);
  const generation = useRef(0);
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof Error ? err.message : "Unable to calculate the trend.");
    },
    [onExpired],
  );
  const fetchReport = useCallback(async (next: TrendFilters, token: number) => {
    if (!next.accountIds.length) {
      setReport(undefined);
      return;
    }
    const result = await api.netWorthTrend(next);
    if (token === generation.current) setReport(result);
  }, []);
  const initialize = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.trendOptions();
      if (token !== generation.current) return;
      const next = readTrendFilters(result);
      setOptions(result);
      setFilters(next);
      await fetchReport(next, token);
    } catch (err) {
      if (token === generation.current) fail(err);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [fail, fetchReport]);
  const invalidate = useCallback(() => {
    ++generation.current;
  }, []);
  useEffect(() => {
    void initialize();
    const navigate = () => {
      if (window.location.hash.split("?")[0] === "#/net-worth/trends") void initialize();
    };
    window.addEventListener("hashchange", navigate);
    return () => {
      invalidate();
      window.removeEventListener("hashchange", navigate);
    };
  }, [initialize, invalidate]);
  async function update() {
    if (!filters) return;
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      await fetchReport(filters, token);
      if (token === generation.current) window.history.pushState(null, "", trendUrl(filters));
    } catch (err) {
      if (token === generation.current) fail(err);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function change(patch: Partial<TrendFilters>) {
    setFilters((current) => (current ? { ...current, ...patch } : current));
  }
  function preset(value: string) {
    if (!options || !filters) return;
    const today = options.businessDate;
    const selected = options.accounts.filter((a) => filters.accountIds.includes(a.id));
    const startDate =
      value === "all"
        ? (selected.map((a) => a.openingDate).sort()[0] ?? today)
        : value === "ytd"
          ? `${today.slice(0, 4)}-01-01`
          : monthsStart(today, Number(value));
    change({ startDate: startDate > today ? today : startDate, endDate: today });
  }
  return {
    options,
    filters,
    report,
    loading,
    error,
    showAccounts,
    setShowAccounts,
    change,
    preset,
    update,
    retry: () => {
      if (options) void update();
      else void initialize();
    },
  };
}
