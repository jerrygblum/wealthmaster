import { useState } from "react";
import { api, ApiError } from "../../services/api";
import type { SpendingLimitEditorProps } from "../../types/componentProps";
import type { EffectiveLimitInput } from "../../types/models";

export function useSpendingLimitEditor({
  categoryId,
  label,
  currency,
  periodType,
  periodStart,
  comparison,
  settingReference,
  businessDate,
  available,
  onSaved,
  onCancel,
  onExpired,
}: SpendingLimitEditorProps) {
  const [amount, setAmount] = useState(comparison?.limit ?? ""),
    [scope, setScope] = useState<"PERIOD" | "NORMAL">("PERIOD");
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    [reset, setReset] = useState(false);
  const periodLabel = periodType === "MONTH" ? periodStart.slice(0, 7) : periodStart.slice(0, 4);
  const current =
    periodType === "MONTH"
      ? periodStart === `${businessDate.slice(0, 7)}-01`
      : periodStart === `${businessDate.slice(0, 4)}-01-01`;
  const input: EffectiveLimitInput = {
    categoryId,
    currency,
    periodType,
    periodStart,
    limit: amount,
    scope,
    expectedSetting: settingReference,
    expectedOverride: comparison?.overrideReference ?? null,
  };
  async function save(removing = false) {
    setPending(true);
    setError("");
    try {
      if (removing) await api.resetEffectiveLimit(input);
      else await api.saveEffectiveLimit(input);
      await onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else {
        setError(e instanceof Error ? e.message : "Unable to save limit.");
        if (e instanceof ApiError && e.status === 412) setStale(true);
      }
    } finally {
      setPending(false);
    }
  }

  return {
    amount,
    setAmount,
    scope,
    setScope,
    pending,
    error,
    stale,
    reset,
    setReset,
    periodLabel,
    current,
    input,
    save,
    categoryId,
    label,
    currency,
    periodType,
    periodStart,
    comparison,
    available,
    onCancel,
  };
}
