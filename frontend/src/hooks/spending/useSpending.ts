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
  function periodStart(value: string, type = period) {
    if (type === "MONTH") {
      return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0
        ? `${value}-01`
        : undefined;
    }
    return /^[0-9]{1,4}$/.test(value) && Number(value) >= 1 && Number(value) <= 9999
      ? `${value.padStart(4, "0")}-01-01`
      : undefined;
  }
  function changeEntry(value: string) {
    setEntry(value);
    const next = periodStart(value);
    if (next && (period === "MONTH" || value.length === 4)) setStart(next);
  }
  function commitEntry() {
    const next = periodStart(entry);
    if (next) setStart(next);
    else setEntry((start || data?.periodStart || "").slice(0, period === "MONTH" ? 7 : 4));
  }
  function changePeriod(type: SpendingPeriod) {
    const selected = start || data?.periodStart;
    setPeriod(type);
    setStart(selected ? (type === "YEAR" ? `${selected.slice(0, 4)}-01-01` : selected) : "");
  }
  const selectedStart = start || data?.periodStart;
  const canPrevious = !!selectedStart && selectedStart !== "0001-01-01";
  const canNext =
    !!selectedStart &&
    selectedStart.slice(0, period === "MONTH" ? 7 : 4) !==
      (period === "MONTH" ? "9999-12" : "9999");
  function move(direction: number) {
    if (!selectedStart || (direction < 0 && !canPrevious) || (direction > 0 && !canNext)) return;
    const date = new Date(`${selectedStart}T00:00:00Z`);
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
    changePeriod,
    start,
    entry,
    changeEntry,
    commitEntry,
    canPrevious,
    canNext,
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
