import { useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { MonthlyLimitBreakdownProps } from "../../types/componentProps";
import type { MonthlyBreakdown } from "../../types/models";

export function useMonthlyLimitBreakdown({
  categoryId,
  label,
  currency,
  year,
  available,
  onSaved,
  onExpired,
  onEditingChange,
}: MonthlyLimitBreakdownProps) {
  const [data, setData] = useState<MonthlyBreakdown>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<string>();
  useEffect(() => {
    onEditingChange?.(!!editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await api.monthlyBreakdown(categoryId, currency, year));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : "Unable to load months.");
    } finally {
      setLoading(false);
    }
  }

  return {
    data,
    loading,
    error,
    editing,
    setEditing,
    load,
    categoryId,
    label,
    currency,
    year,
    available,
    onSaved,
    onExpired,
  };
}
