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
  async function save() {
    if (!data || stale) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api.savePreferences({
        defaultCurrency: currency,
        expectedVersion: data.version,
      });
      setData(result);
      setNotice("Default currency saved.");
    } catch (e) {
      fail(e);
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
    stale,
    load,
    save,
  };
}
