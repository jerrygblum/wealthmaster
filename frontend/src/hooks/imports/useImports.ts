import { useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type {
  ImportBatch,
  ImportPlan,
  ImportPreview,
  ImportSummary,
  ImportSelection,
  ImportUndo,
  ImportResources,
  ImportAccount,
  ImportCategory,
  ImportDecision,
} from "../../types/imports";

export function useImports(onExpired: () => void) {
  const [batches, setBatches] = useState<ImportSummary[]>([]);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [resources, setResources] = useState<ImportResources>({ accounts: [], categories: [] });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [undo, setUndo] = useState<ImportUndo | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [approval, setApproval] = useState(false);
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(error instanceof Error ? error.message : "Migration request failed.");
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    let active = true;
    void Promise.all([api.imports(), api.accounts(), api.categories()])
      .then(([batches, accounts, categories]) => {
        if (active) {
          setBatches(batches);
          setResources({ accounts, categories: categories.items });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setError("Unable to load migration drafts. Refresh to retry.");
      });
    return () => {
      active = false;
    };
  }, [onExpired]);
  function accept(batch: ImportBatch) {
    setBatch(batch);
    setPlan(batch.plan);
    setPreview(null);
    setUndo(null);
    setDirty(false);
    setApproval(false);
  }
  function change(plan: ImportPlan) {
    setPlan(plan);
    setApproval(false);
    setDirty(true);
  }
  async function refreshList() {
    setBatches(await api.imports());
  }
  async function open(id: string) {
    await run(async () => {
      accept(await api.importBatch(id));
      setStep(0);
    });
  }
  async function upload(file: File) {
    await run(async () => {
      accept(await api.uploadWorkbook(file));
      setStep(0);
      await refreshList();
    });
  }
  async function configure(selection: ImportSelection) {
    if (!batch) return;
    await run(async () => {
      accept(await api.configureImport(batch, selection));
      setStep(1);
      await refreshList();
    });
  }
  async function save(review = false, previewStep = 3) {
    if (!batch || !plan) return;
    await run(async () => {
      const saved = await api.saveImport(batch, plan);
      accept(saved);
      await refreshList();
      if (review) {
        setPreview(await api.previewImport(saved.id));
        setStep(previewStep);
      } else setNotice("Draft saved. No financial data created.");
    });
  }
  function mapRows(
    field: "account" | "card" | "category",
    source: string,
    target: string,
    kind?: string,
  ) {
    if (!plan || !batch?.workbook) return;
    const rows = batch.workbook.sheets.find((s) => s.name === plan.selection.sheet)?.rows ?? [];
    const original = new Map(rows.map((row) => [row.number, row]));
    change({
      ...plan,
      rows: plan.rows.map((row) => {
        const raw = original.get(row.row)?.cells[plan.selection.columns[field]]?.value.trim() ?? "";
        return row.include &&
          raw === source &&
          (!kind || (row.kind === "Income" ? "INCOME" : "SPENDING") === kind)
          ? { ...row, [field]: target }
          : row;
      }),
    });
  }
  function selectExisting(
    field: "account" | "card" | "category",
    source: string,
    id: string,
    kind?: string,
  ) {
    if (!plan) return;
    let updated = plan;
    if (field === "category" && id.startsWith("existing:")) {
      const existing = resources.categories.find((c) => c.id === id.slice(9));
      if (!existing) return;
      const key = "c_" + existing.id.replaceAll("-", "");
      if (!plan.categories.some((t) => t.key === key))
        updated = {
          ...updated,
          categories: [
            ...updated.categories,
            {
              key,
              existingId: existing.id,
              version: existing.version,
              create: null,
              parentKey: null,
            },
          ],
        };
      id = key;
    } else if (field !== "category" && id.startsWith("existing:")) {
      const existing = resources.accounts.find((a) => a.id === id.slice(9));
      if (!existing) return;
      const key = "a_" + existing.id.replaceAll("-", "");
      if (!plan.accounts.some((t) => t.key === key))
        updated = {
          ...updated,
          accounts: [
            ...updated.accounts,
            {
              key,
              existingId: existing.id,
              version: existing.version,
              create: null,
              closingBalance: "",
            },
          ],
        };
      id = key;
    }
    const originals = new Map(
      batch?.workbook?.sheets
        .find((s) => s.name === plan.selection.sheet)
        ?.rows.map((row) => [row.number, row]) ?? [],
    );
    change({
      ...updated,
      rows: updated.rows.map((row) =>
        row.include &&
        (originals.get(row.row)?.cells[plan.selection.columns[field]]?.value.trim() ?? "") ===
          source &&
        (!kind || (row.kind === "Income" ? "INCOME" : "SPENDING") === kind)
          ? { ...row, [field]: id }
          : row,
      ),
    });
  }
  function account(target: ImportAccount) {
    if (plan) change({ ...plan, accounts: [...plan.accounts, target] });
  }
  function category(target: ImportCategory) {
    if (plan) change({ ...plan, categories: [...plan.categories, target] });
  }
  function useUncategorized() {
    if (!plan || !batch?.workbook) return;
    const sourceRows = new Map(
      batch.workbook.sheets
        .find((sheet) => sheet.name === plan.selection.sheet)
        ?.rows.map((source) => [source.number, source]) ?? [],
    );
    change({
      ...plan,
      categories: [],
      rows: plan.rows.map((row) => {
        const source =
          sourceRows.get(row.row)?.cells[plan.selection.columns.category]?.value.trim() ?? "";
        const original = source ? `Original category: ${source}` : "";
        return {
          ...row,
          category: "NONE",
          description:
            original && !row.description.includes(original)
              ? [row.description, original].filter(Boolean).join(" | ")
              : row.description,
        };
      }),
    });
    setNotice(
      "All rows are uncategorized. Original categories are preserved in descriptions. Save and preview to apply.",
    );
  }
  function row(number: number, values: Partial<ImportDecision>) {
    if (plan)
      change({
        ...plan,
        rows: plan.rows.map((row) => (row.row === number ? { ...row, ...values } : row)),
      });
  }
  async function commit() {
    if (!batch || !preview || !approval || dirty) return;
    await run(async () => {
      await api.commitImport(batch, preview.token);
      accept(await api.importBatch(batch.id));
      await refreshList();
      setStep(4);
    });
  }
  async function reviewUndo() {
    if (batch) await run(async () => setUndo(await api.previewImportUndo(batch.id)));
  }
  async function reverse() {
    if (!batch || !undo || undo.errors.length) return;
    await run(async () => {
      accept(await api.undoImport(batch));
      await refreshList();
      setNotice("Batch reversed. Created accounts/categories and audit history were retained.");
    });
  }
  async function purge() {
    if (!batch) return;
    await run(async () => {
      await api.purgeImportSource(batch);
      accept(await api.importBatch(batch.id));
      await refreshList();
      setNotice("Private source and draft decisions purged. Batch identity and receipt retained.");
    });
  }
  async function deleteDraft() {
    if (!batch || batch.status !== "DRAFT") return;
    await run(async () => {
      await api.deleteImportDraft(batch);
      setBatch(null);
      setPlan(null);
      setPreview(null);
      setUndo(null);
      setDirty(false);
      setApproval(false);
      setStep(0);
      await refreshList();
      setNotice("Draft and private workbook deleted. The same file can be uploaded again.");
    });
  }
  async function refreshMappings() {
    if (!plan) return;
    await run(async () => {
      const [accounts, categories] = await Promise.all([api.accounts(), api.categories()]);
      setResources({ accounts, categories: categories.items });
      change({
        ...plan,
        accounts: plan.accounts.map((t) => ({
          ...t,
          version: t.existingId
            ? (accounts.find((a) => a.id === t.existingId)?.version ?? t.version)
            : t.version,
        })),
        categories: plan.categories.map((t) => ({
          ...t,
          version: t.existingId
            ? (categories.items.find((c) => c.id === t.existingId)?.version ?? t.version)
            : t.version,
        })),
      });
      setNotice("Mappings refreshed. Review changed resources and save a new preview.");
    });
  }
  return {
    batches,
    batch,
    plan,
    resources,
    preview,
    undo,
    pending,
    error,
    notice,
    step,
    setStep,
    dirty,
    approval,
    setApproval,
    open,
    upload,
    configure,
    save,
    change,
    mapRows,
    selectExisting,
    account,
    category,
    useUncategorized,
    row,
    commit,
    reviewUndo,
    reverse,
    purge,
    deleteDraft,
    refreshMappings,
  };
}
