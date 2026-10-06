import { useCallback, useEffect, useState } from "react";

import type { FormEvent } from "react";
import { api, ApiError } from "../../services/api";
import type { CategoriesPageProps } from "../../types/componentProps";
import type { Category, CategoryInput, CategoryList } from "../../types/models";

export function useCategories({ user, onExpired, onLogout }: CategoriesPageProps) {
  const [data, setData] = useState<CategoryList>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [archived, setArchived] = useState(false);
  const selectedCategory = new URLSearchParams(location.hash.split("?")[1]).get("categoryId");
  const [form, setForm] = useState<CategoryInput>();
  const [editing, setEditing] = useState<Category>();
  const [deleting, setDeleting] = useState<Category>();
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else {
        setError(err instanceof Error ? err.message : "Unable to load categories.");
        if (err instanceof ApiError && err.status === 412) setStale(true);
      }
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.categories();
      setData(result);
      if (selectedCategory)
        setArchived(result.items.find((c) => c.id === selectedCategory)?.available === false);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [fail, selectedCategory]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(run: () => Promise<unknown>, message: string) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await run();
      setForm(undefined);
      setEditing(undefined);
      setDeleting(undefined);
      setNotice(message);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }
  function start(category?: Category) {
    setEditing(category);
    setStale(false);
    setError("");
    setNotice("");
    setForm(
      category
        ? { name: category.name, type: category.type, parentId: category.parentId }
        : { name: "", type: "SPENDING", parentId: null },
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (form) await action(() => api.saveCategory(form, editing), "Category saved.");
  }
  async function logout() {
    setPending(true);
    try {
      await api.logout();
      onLogout();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout();
      else fail(err);
    } finally {
      setPending(false);
    }
  }
  const items = data?.items ?? [];
  const locked = !!editing && (editing.hasActivity || editing.hasChildren);
  const parents = items.filter(
    (c) =>
      !c.parentId &&
      c.type === form?.type &&
      c.id !== editing?.id &&
      (c.active || c.id === editing?.parentId),
  );
  const busy = pending || loading || !!form || !!deleting || limitsBusy;
  const refreshHistory = useCallback(async () => {
    try {
      setData(await api.categories());
    } catch (e) {
      fail(e);
    }
  }, [fail]);
  const visible = (c: Category) => (archived ? !c.available : c.available);

  const deleteCategory = () => {
    if (deleting) void action(() => api.deleteCategory(deleting), "Category deleted.");
  };

  const installStarters = () =>
    void action(api.installCategoryStarters, "Starter categories added.");

  const archiveCategory = (c: Category) =>
    void action(
      () => api.setCategoryActive(c, !c.active),
      c.active ? "Category archived." : "Category restored.",
    );

  return {
    data,
    loading,
    pending,
    limitsBusy,
    setLimitsBusy,
    error,
    setError,
    notice,
    stale,
    setStale,
    archived,
    setArchived,
    form,
    setForm,
    editing,
    setEditing,
    deleting,
    setDeleting,
    load,
    start,
    save,
    logout,
    items,
    locked,
    parents,
    busy,
    refreshHistory,
    visible,
    deleteCategory,
    installStarters,
    archiveCategory,
    user,
    onExpired,
  };
}
