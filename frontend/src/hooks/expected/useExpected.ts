import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type {
  Category,
  ExpectedDefinition,
  ExpectedInput,
  ExpectedOccurrence,
  ExpectedRecordInput,
  ExpectedReport,
  FinancialAccount,
  Operation,
} from "../../types/models";

export function useExpected({ onExpired }: { onExpired: () => void }) {
  const [report, setReport] = useState<ExpectedReport>();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<ExpectedInput>();
  const [editing, setEditing] = useState<ExpectedDefinition>();
  const [deleting, setDeleting] = useState<ExpectedDefinition>();
  const [selected, setSelected] = useState<ExpectedOccurrence>();
  const [recordForm, setRecordForm] = useState<ExpectedRecordInput>();
  const [candidates, setCandidates] = useState<{
    items: Operation[];
    page: number;
    hasMore: boolean;
  }>();
  const [candidateLoading, setCandidateLoading] = useState(false);
  const generation = useRef(0),
    candidateGeneration = useRef(0),
    busy = useRef(false);
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else {
        setError(e instanceof Error ? e.message : "Unable to load expectations.");
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
      const [r, a, c] = await Promise.all([
        api.expected(month ? `${month}-01` : undefined),
        api.accounts(),
        api.categories(),
      ]);
      if (token === generation.current) {
        setReport(r);
        setAccounts(a);
        setCategories(c.items);
      }
    } catch (e) {
      if (token === generation.current) fail(e);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [month, fail]);
  const invalidate = useCallback(() => {
    ++generation.current;
    ++candidateGeneration.current;
  }, []);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);
  function close() {
    setForm(undefined);
    setEditing(undefined);
    setDeleting(undefined);
    setSelected(undefined);
    setRecordForm(undefined);
    setCandidates(undefined);
    setStale(false);
    ++candidateGeneration.current;
    setCandidateLoading(false);
  }
  function start(d?: ExpectedDefinition) {
    close();
    setError("");
    setEditing(d);
    setForm(
      d
        ? {
            name: d.name,
            kind: d.kind,
            accountId: d.accountId,
            destinationAccountId: d.destinationAccountId,
            categoryId: d.categoryId,
            amount: d.amount,
            dayOfMonth: d.dayOfMonth,
            firstMonth: d.firstMonth,
            lastMonth: d.lastMonth,
            payee: d.payee ?? "",
            notes: d.notes ?? "",
          }
        : {
            name: "",
            kind: "EXPENSE",
            accountId: "",
            destinationAccountId: null,
            categoryId: null,
            amount: "",
            dayOfMonth: 1,
            firstMonth: report?.month ?? "",
            lastMonth: null,
            payee: "",
            notes: "",
          },
    );
  }
  async function mutate(action: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await action();
      close();
      await load();
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function suggestions(item: ExpectedOccurrence, page = 0) {
    if (!report) return;
    const token = ++candidateGeneration.current;
    setSelected(item);
    setRecordForm(undefined);
    setCandidateLoading(true);
    setError("");
    setStale(false);
    try {
      const result = await api.expectedCandidates(item, report.month, page);
      if (token === candidateGeneration.current) setCandidates(result);
    } catch (e) {
      if (token === candidateGeneration.current) fail(e);
    } finally {
      if (token === candidateGeneration.current) setCandidateLoading(false);
    }
  }
  function record(item: ExpectedOccurrence) {
    close();
    setError("");
    setSelected(item);
    setRecordForm({
      amount: item.definition.amount,
      transactionDate: accounts
        .filter(
          (a) =>
            a.id === item.definition.accountId || a.id === item.definition.destinationAccountId,
        )
        .map((a) => a.openingDate)
        .concat(item.expectedDate > report!.businessDate ? report!.businessDate : item.expectedDate)
        .sort()
        .at(-1)!,
      valueDate: null,
      payee: item.definition.payee ?? "",
      description: item.definition.name,
      notes: item.definition.notes ?? "",
      categoryId: item.definition.categoryId,
    });
  }
  const shownMonth = month || report?.month.slice(0, 7) || "";
  function selectMonth(value: string) {
    if (/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0) {
      close();
      setMonth(value);
    }
  }
  function move(direction: number) {
    if (!shownMonth) return;
    const date = new Date(`${shownMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    selectMonth(date.toISOString().slice(0, 7));
  }
  return {
    report,
    accounts,
    categories,
    loading,
    pending,
    error,
    stale,
    showAll,
    setShowAll,
    form,
    setForm,
    editing,
    deleting,
    setDeleting,
    selected,
    recordForm,
    setRecordForm,
    candidates,
    candidateLoading,
    shownMonth,
    selectMonth,
    move,
    load,
    close,
    start,
    record,
    suggestions,
    save: () => (form ? mutate(() => api.saveExpected(form, editing)) : Promise.resolve()),
    remove: () => (deleting ? mutate(() => api.deleteExpected(deleting)) : Promise.resolve()),
    reconcile: (item: ExpectedOccurrence, op?: Operation, skipped = false) =>
      report
        ? mutate(() => api.reconcileExpected(item, report.month, op, skipped))
        : Promise.resolve(),
    saveRecord: () =>
      selected && recordForm && report
        ? mutate(() => api.recordExpected(selected, report.month, recordForm))
        : Promise.resolve(),
  };
}
