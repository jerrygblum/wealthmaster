import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { Draft } from "../../types/budgetDraft";
import type { CategoryLimitsProps } from "../../types/componentProps";
import type { BudgetSettings } from "../../types/models";

export function useCategoryLimits({
  onExpired,
  categories,
  renderCategory,
  onChanged,
  onBusyChange,
  disabled = false,
}: CategoryLimitsProps) {
  const [data, setData] = useState<BudgetSettings>();
  const [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(),
    [stale, setStale] = useState(false);
  const generation = useRef(0);
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else {
        setError(e instanceof Error ? e.message : "Unable to load normal limits.");
        if (e instanceof ApiError && e.status === 412) setStale(true);
      }
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.budgetSettings();
      if (token === generation.current) setData(result);
    } catch (e) {
      if (token === generation.current) fail(e);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [fail]);
  const invalidate = useCallback(() => {
    ++generation.current;
  }, []);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);
  useEffect(() => {
    onBusyChange?.(pending || !!draft);
  }, [pending, draft, onBusyChange]);
  useEffect(() => {
    const id = new URLSearchParams(location.hash.split("?")[1]).get("categoryId");
    if (id && !loading)
      document.getElementById(`category-${id}`)?.scrollIntoView?.({ block: "nearest" });
  }, [loading]);
  async function save() {
    if (!draft) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api.saveBudgetSetting({
        categoryId: draft.categoryId,
        currency: draft.currency,
        mode: draft.mode,
        limit: draft.mode === "NONE" ? null : draft.limit,
        expected: draft.setting ? { id: draft.setting.id, version: draft.setting.version } : null,
      });
      setDraft(undefined);
      setStale(false);
      setNotice(
        "Normal limit saved for the current and future periods. Period exceptions are retained.",
      );
      await load();
      await onChanged?.();
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  }
  const selected = new URLSearchParams(location.hash.split("?")[1]).get("categoryId");

  return {
    data,
    loading,
    pending,
    error,
    setError,
    notice,
    setNotice,
    draft,
    setDraft,
    stale,
    setStale,
    load,
    save,
    selected,
    categories,
    renderCategory,
    disabled,
  };
}
