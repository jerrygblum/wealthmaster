import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type {
  InvestmentAccount,
  InvestmentActivity,
  InvestmentInput,
  InvestmentKind,
  InvestmentPreview,
  InvestmentReversal,
  SecurityInput,
} from "../../types/investments";
import type { FinancialAccount } from "../../types/models";

export function useInvestments(accountId: string, onExpired: () => void) {
  const requests = useRef({ version: 0 });
  const [data, setData] = useState<InvestmentAccount>();
  const [account, setAccount] = useState<FinancialAccount>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"holdings" | "activity">(
    window.location.hash.includes("?activity=") ? "activity" : "holdings",
  );
  const [form, setForm] = useState<InvestmentInput>();
  const [securityForm, setSecurityForm] = useState<SecurityInput>();
  const [preview, setPreview] = useState<InvestmentPreview>();
  const [snapshot, setSnapshot] = useState<InvestmentInput>();
  const [reversing, setReversing] = useState<InvestmentActivity>();
  const [reversal, setReversal] = useState<InvestmentReversal>();
  const [activityPage, setActivityPage] = useState(0);
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(error instanceof Error ? error.message : "Unable to load investments.");
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    const version = ++requests.current.version;
    setLoading(true);
    setError(null);
    try {
      const [view, account] = await Promise.all([
        api.investmentAccount(accountId),
        api.account(accountId),
      ]);
      if (version !== requests.current.version) return;
      setData(view);
      setAccount(account);
      setActivityPage(0);
      setPreview(undefined);
      setSnapshot(undefined);
      setReversal(undefined);
    } catch (error) {
      if (version === requests.current.version) fail(error);
    } finally {
      if (version === requests.current.version) setLoading(false);
    }
  }, [accountId, fail]);
  useEffect(() => {
    const active = requests.current;
    void load();
    return () => {
      active.version++;
    };
  }, [load]);
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }
  function start(kind: InvestmentKind, copy?: InvestmentActivity) {
    if (!data) return;
    setPreview(undefined);
    setSnapshot(undefined);
    setReversing(undefined);
    setReversal(undefined);
    setError(null);
    setNotice(null);
    setForm({
      requestId: crypto.randomUUID(),
      accountId,
      securityId: copy?.securityId ?? "",
      kind,
      quantity: copy?.quantity ?? "",
      unitPrice: copy?.unitPrice ?? null,
      tradeDate: copy?.tradeDate ?? data.asOf,
      cashDate: kind === "OPENING" ? null : (copy?.cashDate ?? data.asOf),
      acquiredOn: kind === "OPENING" ? (copy?.acquiredOn ?? null) : null,
      settlement: kind === "OPENING" ? null : (copy?.settlement ?? ""),
      acquisitionCost: kind === "OPENING" ? (copy?.acquisitionCost ?? null) : null,
      aggregateOpening: kind === "OPENING" ? (copy?.aggregateOpening ?? true) : false,
      charges: copy?.charges ?? [],
      reference: copy?.reference ?? "",
      notes: copy?.notes ?? "",
      cashOnlyConfirmed: false,
      allocations: null,
    });
  }
  function change(values: Partial<InvestmentInput>) {
    if (form) setForm({ ...form, ...values });
  }
  function cancel() {
    setForm(undefined);
    setPreview(undefined);
    setSnapshot(undefined);
    setError(null);
  }
  async function review() {
    if (form)
      await run(async () => {
        setPreview(await api.previewInvestment(form));
        setSnapshot(form);
      });
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(snapshot);
  async function commit() {
    if (!form || !preview || dirty || preview.errors.length) return;
    await run(async () => {
      await api.commitInvestment(form, preview.token);
      cancel();
      await load();
      setNotice("Investment activity saved. Holdings and cash updated together.");
      setTab("holdings");
    });
  }
  async function createSecurity() {
    if (securityForm)
      await run(async () => {
        const security = await api.createSecurity(securityForm);
        await load();
        if (form) setForm({ ...form, securityId: security.id });
        setSecurityForm(undefined);
        setNotice("Security created. Select it for an opening holding or trade.");
      });
  }
  function newSecurity() {
    setSecurityForm({
      name: "",
      symbol: "",
      exchange: "",
      isin: null,
      type: "STOCK",
      currency: "USD",
    });
  }
  async function reviewReverse(activity: InvestmentActivity) {
    await run(async () => {
      setReversing(activity);
      setReversal(undefined);
      setReversal(await api.previewInvestmentReversal(activity.id));
    });
  }
  async function reverse(replace: boolean) {
    if (!reversing || !reversal || reversal.errors.length) return;
    await run(async () => {
      const old = reversing;
      await api.reverseInvestment(old, reversal.token);
      setReversing(undefined);
      setReversal(undefined);
      await load();
      if (replace) start(old.kind, old);
      setNotice(
        replace
          ? "Original activity reversed. Review and save the corrected replacement."
          : "Investment activity reversed; cash and holdings reconciled.",
      );
    });
  }
  return {
    data,
    account,
    loading,
    pending,
    error,
    notice,
    tab,
    setTab,
    form,
    change,
    cancel,
    start,
    securityForm,
    setSecurityForm,
    newSecurity,
    createSecurity,
    preview,
    dirty,
    review,
    commit,
    load,
    reversing,
    reversal,
    reviewReverse,
    reverse,
    activityPage,
    setActivityPage,
    cancelReverse: () => {
      setReversing(undefined);
      setReversal(undefined);
    },
  };
}
