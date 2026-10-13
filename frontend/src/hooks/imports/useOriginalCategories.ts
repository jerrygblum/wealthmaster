import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { OriginalCategoryGroup } from "../../types/originalCategories";
import type { Category } from "../../types/models";

export function useOriginalCategories(onExpired: () => void) {
  const requests = useRef({ version: 0 });
  const [groups, setGroups] = useState<OriginalCategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState("");
  const [targetId, setTargetId] = useState("");
  const [includeCategorized, setIncludeCategorized] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const key = (group: OriginalCategoryGroup) => `${group.type}:${group.originalCategory}`;
  const group = groups.find((item) => key(item) === selected);
  const target = categories.find((item) => item.id === targetId);
  const affected = group?.transactions.filter((row) => includeCategorized || !row.categoryId) ?? [];
  const load = useCallback(async () => {
    const version = ++requests.current.version;
    setLoading(true);
    setError(null);
    try {
      const [groups, categories] = await Promise.all([
        api.originalCategoryGroups(),
        api.categories(),
      ]);
      if (version !== requests.current.version) return;
      setGroups(groups);
      setCategories(categories.items);
      setTargetId("");
      setConfirming(false);
      setStale(false);
      setPage(0);
    } catch (error) {
      if (version !== requests.current.version) return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(error instanceof Error ? error.message : "Unable to load original categories.");
      setStale(true);
    } finally {
      if (version === requests.current.version) setLoading(false);
    }
  }, [onExpired]);
  useEffect(() => {
    const active = requests.current;
    void load();
    return () => {
      active.version++;
    };
  }, [load]);
  function select(group: OriginalCategoryGroup) {
    setSelected(key(group));
    setTargetId("");
    setIncludeCategorized(false);
    setConfirming(false);
    setPage(0);
    setNotice(null);
  }
  async function apply() {
    if (!group || !target || !confirming || stale || pending || loading || !affected.length) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.mapOriginalCategory({
        originalCategory: group.originalCategory,
        type: group.type,
        categoryId: target.id,
        categoryVersion: target.version,
        includeCategorized,
        transactions: affected.map(({ id, version }) => ({ id, version })),
      });
      await load();
      setNotice(`${result.updated} transactions categorized. Original descriptions are preserved.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(error instanceof Error ? error.message : "Unable to apply mapping.");
      if (error instanceof ApiError && [404, 409, 412].includes(error.status)) setStale(true);
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }
  return {
    groups,
    categories,
    group,
    target,
    targetId,
    includeCategorized,
    confirming,
    loading,
    pending,
    stale,
    error,
    notice,
    page,
    affected,
    load,
    select,
    apply,
    setPage,
    chooseTarget: (id: string) => {
      setTargetId(id);
      setConfirming(false);
    },
    includeExisting: (value: boolean) => {
      setIncludeCategorized(value);
      setConfirming(false);
    },
    setConfirming,
  };
}
