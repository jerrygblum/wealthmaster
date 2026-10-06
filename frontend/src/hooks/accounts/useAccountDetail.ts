import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { AccountDetailProps } from "../../types/componentProps";
import type {
  Category,
  FinancialAccount,
  LedgerInput,
  LedgerKind,
  Operation,
} from "../../types/models";

export function useAccountDetail({ id, onBack, onExpired }: AccountDetailProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [account, setAccount] = useState<FinancialAccount>();
  const [items, setItems] = useState<Operation[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<LedgerInput>();
  const [editing, setEditing] = useState<Operation>();
  const [deleting, setDeleting] = useState<Operation>();
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else {
        setError(err instanceof Error ? err.message : "Unable to load activity.");
        if (err instanceof ApiError && err.status === 412) setStale(true);
      }
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, all, activity, categoryList] = await Promise.all([
        api.account(id),
        api.accounts(),
        api.activity(id, page),
        api.categories(),
      ]);
      setAccount(a);
      setAccounts(all);
      setCategories(categoryList.items);
      setItems(activity.items);
      setMore(activity.hasMore);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [id, page, fail]);
  useEffect(() => {
    void load();
  }, [load]);
  function start(kind: LedgerKind, op?: Operation) {
    setError("");
    setStale(false);
    setEditing(op);
    setForm(
      op
        ? { ...op }
        : {
            accountId: id,
            kind,
            amount: "",
            transactionDate: account?.balanceAsOf ?? new Date().toISOString().slice(0, 10),
            valueDate: null,
            payee: "",
            description: "",
            notes: "",
            destinationAccountId: "",
            categoryId: null,
          },
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setPending(true);
    setError("");
    try {
      await api.saveActivity(form, editing);
      setForm(undefined);
      setEditing(undefined);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await api.deleteActivity(deleting);
      setDeleting(undefined);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }
  const active = accounts.filter((a) => a.active);
  const source = accounts.find((a) => a.id === form?.accountId);
  const destinations = active.filter(
    (a) => a.id !== form?.accountId && a.currency === source?.currency,
  );
  const canChange = (op: Operation) =>
    [op.accountId, op.destinationAccountId]
      .filter(Boolean)
      .every((a) => accounts.some((x) => x.id === a && x.active));
  const balance = account?.currentBalance ?? account?.openingBalance ?? "0";

  return {
    categories,
    accounts,
    account,
    items,
    page,
    setPage,
    more,
    loading,
    error,
    setError,
    form,
    setForm,
    editing,
    deleting,
    setDeleting,
    pending,
    stale,
    setStale,
    load,
    start,
    save,
    remove,
    active,
    source,
    destinations,
    canChange,
    balance,
    id,
    onBack,
  };
}
