import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { Preferences } from "../../types/models";
export function usePreferences(onExpired: () => void) {
  const [data, setData] = useState<Preferences>();
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [stale, setStale] = useState(false);
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else {
        setError(e instanceof Error ? e.message : "Unable to save preferences.");
        if (e instanceof ApiError && e.status === 412) setStale(true);
      }
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setStale(false);
    setConfirming(false);
    try {
      const result = await api.preferences();
      setData(result);
      setCurrency(result.defaultCurrency ?? "");
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [fail]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(confirmed = false) {
    if (!data || stale) return;
    if (currency !== data.defaultCurrency && data.hasLimitsToReset && !confirmed) {
      setConfirming(true);
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api.savePreferences({
        defaultCurrency: currency,
        expectedVersion: data.version,
        confirmLimitReset: confirmed,
      });
      setData(result);
      setConfirming(false);
      setNotice("Default currency saved. Enter spending limits in Categories.");
    } catch (e) {
      fail(e);
      if (e instanceof ApiError && e.status === 409) setConfirming(true);
    } finally {
      setPending(false);
    }
  }
  return {
    data,
    currency,
    setCurrency,
    loading,
    pending,
    error,
    notice,
    confirming,
    setConfirming,
    stale,
    load,
    save,
  };
}
