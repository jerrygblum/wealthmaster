import { useRefreshOnFocus } from "../useRefreshOnFocus";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { NetWorthPageProps } from "../../types/componentProps";
import type { CurrentNetWorth } from "../../types/models";

export function useNetWorth({ user, onExpired }: NetWorthPageProps) {
  const [report, setReport] = useState<CurrentNetWorth>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
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
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.currentNetWorth();
      if (token === generation.current) setReport(result);
    } catch (err) {
      if (token === generation.current) fail(err);
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
  useRefreshOnFocus(load);

  return { report, loading, error, load, user };
}
