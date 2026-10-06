import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { NetWorthPageProps } from "../../types/componentProps";
import type { CurrentNetWorth } from "../../types/models";

export function useNetWorth({ user, onExpired, onLogout }: NetWorthPageProps) {
  const [report, setReport] = useState<CurrentNetWorth>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
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
  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      await api.logout();
      onLogout();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout();
      else fail(err);
    } finally {
      setLoggingOut(false);
    }
  }

  return { report, loading, error, loggingOut, load, logout, user };
}
