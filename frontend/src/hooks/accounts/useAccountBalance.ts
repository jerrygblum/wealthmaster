import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { FinancialAccount } from "../../types/models";
import type { AccountBalance } from "../../types/accountBalance";
import { addBalanceDays } from "../../utils/balanceDates";

export function useAccountBalance(account: FinancialAccount, onExpired: () => void) {
  const today = account.balanceAsOf ?? "";
  const [date, setDate] = useState(today);
  const [includeExpected, setIncludeExpected] = useState(false);
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<AccountBalance>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const effectiveExpected = includeExpected && date >= today;
  const load = useCallback(async () => {
    const token = ++generation.current;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "0001-01-01" || date > "9999-12-31") {
      setError("Choose a valid balance date.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.accountBalance(account.id, date, effectiveExpected, page);
      if (token === generation.current) setReport(result);
    } catch (err) {
      if (token !== generation.current) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof Error ? err.message : "Unable to calculate the balance.");
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [account, date, effectiveExpected, page, onExpired]);
  const invalidate = useCallback(() => {
    ++generation.current;
  }, []);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);
  function chooseDate(value: string) {
    if (value === date && page === 0) return;
    invalidate();
    setDate(value);
    setPage(0);
  }
  function chooseExpected(value: boolean) {
    if (value === includeExpected && page === 0) return;
    invalidate();
    setIncludeExpected(value);
    setPage(0);
  }
  return {
    account,
    today,
    date,
    chooseDate,
    includeExpected,
    chooseExpected,
    page,
    setPage,
    report,
    loading,
    error,
    load,
    shortcut: (days: number) => chooseDate(addBalanceDays(today, days)),
  };
}
