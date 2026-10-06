import { useState } from "react";
import { api, ApiError } from "../../services/api";
import type { BudgetCopyToolProps } from "../../types/componentProps";
import type { Budget } from "../../types/models";

export function useBudgetCopyTool({ periodType, periodStart, onExpired }: BudgetCopyToolProps) {
  const [items, setItems] = useState<Budget[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems((await api.budgets(periodType, periodStart)).items);
      setSelected([]);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e instanceof Error ? e.message : "Unable to copy exceptions.");
  }
  async function copy() {
    setLoading(true);
    setError("");
    try {
      const result = await api.copyBudgets(
        items.filter((b) => selected.includes(b.id)),
        target,
      );
      setNotice(
        `Created ${result.created.length} exceptions. ${result.skipped.map((s) => `${items.find((b) => b.id === s.id)?.categoryName}: ${s.reason === "TARGET_EXISTS" ? "target exception already exists" : "category branch unavailable"}`).join("; ")}`,
      );
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }

  return {
    items,
    selected,
    setSelected,
    target,
    setTarget,
    loading,
    error,
    notice,
    load,
    copy,
    periodType,
  };
}
