import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { NetWorthPageProps } from "../../types/componentProps";
import type { CurrentNetWorth } from "../../types/models";

export function useNetWorth({ user, onExpired }: NetWorthPageProps) {
  const [report, setReport] = useState<CurrentNetWorth>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else
        setError(
          err instanceof Error ? err.message : "Unable to calculate net worth. Please try again.",
        );
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await api.currentNetWorth());
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [fail]);
  useEffect(() => {
    void load();
  }, [load]);
  return { report, loading, error, load, user };
}
