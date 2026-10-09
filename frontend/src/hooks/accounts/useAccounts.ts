import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "../../services/api";
import type { FinancialAccount } from "../../types/models";

import type { AccountsPageProps } from "../../types/componentProps";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function useAccounts({ user, onExpired }: AccountsPageProps) {
  const [selected, setSelected] = useState<string | null>(
    window.location.hash.match(/^#\/accounts\/([a-f0-9-]+)$/)?.[1] ?? null,
  );
  useEffect(() => {
    const change = () =>
      setSelected(window.location.hash.match(/^#\/accounts\/([a-f0-9-]+)$/)?.[1] ?? null);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | undefined>();
  const [archived, setArchived] = useState(false);
  const [deleting, setDeleting] = useState<FinancialAccount | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const visibleAccounts = accounts.filter((account) => account.active !== archived);
  async function manage(account: FinancialAccount, operation: "archive" | "restore" | "delete") {
    setActionPending(true);
    setActionError(null);
    setStale(false);
    try {
      if (operation === "delete") {
        await api.deleteAccount(account);
        setAccounts((previous) => previous.filter((item) => item.id !== account.id));
        setDeleting(null);
      } else {
        const changed = await (operation === "archive"
          ? api.archiveAccount(account)
          : api.restoreAccount(account));
        setAccounts((previous) =>
          previous.map((item) => (item.id === changed.id ? changed : item)),
        );
      }
      setNotice(
        `${account.name} ${operation === "delete" ? "deleted" : operation === "archive" ? "archived" : "restored"}.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else {
        setActionError(errorMessage(err));
        setStale(err instanceof ApiError && err.status === 412);
      }
    } finally {
      setActionPending(false);
    }
  }
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await api.accounts());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onExpired]);
  useEffect(() => {
    if (!selected) void load();
  }, [load, selected]);
  return {
    selected,
    setSelected,
    accounts,
    setAccounts,
    loading,
    error,
    showForm,
    setShowForm,
    editing,
    setEditing,
    archived,
    setArchived,
    deleting,
    setDeleting,
    actionPending,
    actionError,
    setActionError,
    stale,
    setStale,
    visibleAccounts,
    manage,
    notice,
    setNotice,
    load,
    user,
    onExpired,
  };
}
