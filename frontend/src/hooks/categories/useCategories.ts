import { convertLimit } from "../../utils/limitPresentation";
import { useCallback, useEffect, useState } from "react";

import type { FormEvent } from "react";
import { api, ApiError } from "../../services/api";
import type { CategoriesPageProps } from "../../types/componentProps";
import type {
  BudgetMode,
  BudgetSetting,
  BudgetSettings,
  Preferences,
  Category,
  CategoryInput,
  CategoryList,
} from "../../types/models";

export function useCategories({ user, onExpired, onLogout }: CategoriesPageProps) {
  const [data, setData] = useState<CategoryList>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [limitData, setLimitData] = useState<BudgetSettings>();
  const [preferences, setPreferences] = useState<Preferences>();
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limitsError, setLimitsError] = useState("");
  const [limitMode, setLimitUnit] = useState<BudgetMode>("NONE");
  const [limitAmount, setDisplayedLimit] = useState("");
  const [limitSource, setLimitSource] = useState<{ mode: BudgetMode; amount: string }>({
    mode: "NONE",
    amount: "",
  });
  const [originalLimit, setOriginalLimit] = useState<BudgetSetting>();
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
  useEffect(() => {
    if (selectedCategory && !loading)
      document
        .getElementById(`category-${selectedCategory}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [selectedCategory, loading, archived]);
  const loadLimits = useCallback(async () => {
    setLimitsLoading(true);
    setLimitsError("");
    try {
      const [settings, prefs] = await Promise.all([api.budgetSettings(), api.preferences()]);
      setLimitData(settings);
      setPreferences(prefs);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setLimitsError(err instanceof Error ? err.message : "Unable to load spending limits.");
    } finally {
      setLimitsLoading(false);
    }
  }, [onExpired]);
  useEffect(() => {
    void loadLimits();
  }, [loadLimits]);
  useEffect(() => {
    if (!editing || !limitData || !preferences || limitsLoading || limitsError) return;
    const setting = limitData.items.find(
      (s) => s.categoryId === editing.id && s.currency === preferences.defaultCurrency,
    );
    setOriginalLimit(setting);
    setLimitUnit(setting?.mode ?? "NONE");
    setDisplayedLimit(setting?.limit ?? "");
    setLimitSource({ mode: setting?.mode ?? "NONE", amount: setting?.limit ?? "" });
  }, [editing, limitData, preferences, limitsLoading, limitsError]);
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
      await Promise.all([load(), loadLimits()]);
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }
  function start(category?: Category) {
    setEditing(category);
    const setting = limitData?.items.find(
      (s) => s.categoryId === category?.id && s.currency === preferences?.defaultCurrency,
    );
    setOriginalLimit(setting);
    setLimitUnit(setting?.mode ?? "NONE");
    setDisplayedLimit(setting?.limit ?? "");
    setLimitSource({ mode: setting?.mode ?? "NONE", amount: setting?.limit ?? "" });
    setStale(false);
    setError("");
    setNotice("");
    setForm(
      category
        ? { name: category.name, type: category.type, parentId: category.parentId }
        : { name: "", type: "SPENDING", parentId: null },
    );
  }
  function setLimitMode(mode: BudgetMode) {
    setLimitUnit(mode);
    if (mode !== "NONE") {
      setDisplayedLimit(convertLimit(limitSource.amount, limitSource.mode, mode));
      if (limitSource.mode === "NONE") setLimitSource({ mode, amount: limitSource.amount });
    }
  }
  function setLimitAmount(amount: string) {
    setDisplayedLimit(amount);
    setLimitSource({ mode: limitMode, amount });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const input: CategoryInput = { ...form };
    const savingMode = limitMode === "NONE" ? "NONE" : limitSource.mode;
    const changed =
      savingMode !== (originalLimit?.mode ?? "NONE") ||
      (savingMode !== "NONE" && limitSource.amount !== (originalLimit?.limit ?? ""));
    if (form.type === "SPENDING" && !form.parentId && changed) {
      if (!preferences || limitsLoading || limitsError) {
        setError("Reload spending limits before changing them.");
        return;
      }
      input.normalLimit = {
        mode: savingMode,
        limit: savingMode === "NONE" ? null : limitSource.amount,
        expected: originalLimit ? { id: originalLimit.id, version: originalLimit.version } : null,
        expectedPreferencesVersion: preferences.version,
      };
    }
    await action(() => api.saveCategory(input, editing), "Category saved.");
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
  const busy = pending || loading || !!form || !!deleting;
  function cancelForm() {
    setForm(undefined);
    setEditing(undefined);
    setStale(false);
    setError("");
    void load();
    void loadLimits();
  }
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
    selectedCategory,
    data,
    loading,
    pending,
    limitData,
    preferences,
    limitsLoading,
    limitsError,
    loadLimits,
    limitMode,
    setLimitMode,
    limitAmount,
    setLimitAmount,
    originalLimit,
    limitSource,
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
    cancelForm,
    visible,
    deleteCategory,
    installStarters,
    archiveCategory,
    user,
    onExpired,
  };
}
