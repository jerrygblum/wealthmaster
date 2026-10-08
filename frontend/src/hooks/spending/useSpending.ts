import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "../../services/api";
import type { SpendingPageProps } from "../../types/componentProps";
import type { SpendingPeriod, Operation, SpendingReport } from "../../types/models";

export function useSpending({ onExpired }: SpendingPageProps) {
  const [period, setPeriod] = useState<SpendingPeriod>("MONTH"),
    [start, setStart] = useState(""),
    [entry, setEntry] = useState("");
  const [data, setData] = useState<SpendingReport>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [activity, setActivity] = useState<{
    categoryId: string | null;
    label: string;
    currency: string;
    items: Operation[];
    page: number;
    hasMore: boolean;
  }>();
  const [activityLoading, setActivityLoading] = useState(false);
  const generation = useRef(0),
    activityGeneration = useRef(0);
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : "Unable to load spending.");
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    const token = ++generation.current;
    ++activityGeneration.current;
    setLoading(true);
    setError("");
    setActivity(undefined);
    setActivityLoading(false);
    try {
      const report = await api.spending(period, start || undefined);
      if (token === generation.current) {
        setData(report);
        setEntry(report.periodStart.slice(0, period === "MONTH" ? 7 : 4));
      }
    } catch (e) {
      if (token === generation.current) fail(e);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [period, start, fail]);
  const invalidate = useCallback(() => {
    ++generation.current;
    ++activityGeneration.current;
  }, []);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);
  function move(direction: number) {
    if (!data) return;
    const date = new Date(`${data.periodStart}T00:00:00Z`);
    if (period === "MONTH") date.setUTCMonth(date.getUTCMonth() + direction);
    else date.setUTCFullYear(date.getUTCFullYear() + direction);
    setStart(date.toISOString().slice(0, 10));
  }
  async function openActivity(
    categoryId: string | null,
    label: string,
    currency: string,
    page = 0,
  ) {
    if (!data) return;
    const token = ++activityGeneration.current;
    setActivityLoading(true);
    setError("");
    try {
      const result = await api.spendingActivity(
        data.periodType,
        data.periodStart,
        currency,
        categoryId,
        page,
      );
      if (token === activityGeneration.current)
        setActivity({ categoryId, label, currency, ...result });
    } catch (e) {
      if (token === activityGeneration.current) fail(e);
    } finally {
      if (token === activityGeneration.current) setActivityLoading(false);
    }
  }

  return {
    period,
    setPeriod,
    start,
    setStart,
    entry,
    setEntry,
    data,
    loading,
    error,
    all,
    setAll,
    expanded,
    setExpanded,
    activity,
    setActivity,
    activityLoading,
    setActivityLoading,
    activityGeneration,
    load,
    move,
    openActivity,
    onExpired,
  };
}
