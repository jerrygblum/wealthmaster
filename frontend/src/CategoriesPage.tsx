import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { Category, CategoryInput, CategoryList, CategoryType, User } from "./api";

export function categoryLabel(category: Category, all: Category[]) {
  const parent = all.find(item => item.id === category.parentId);
  return parent ? `${parent.name} → ${category.name}` : category.name;
}

export function CategoriesPage({ user, onExpired, onLogout }: { user: User; onExpired: () => void; onLogout: () => void }) {
  const [data, setData] = useState<CategoryList>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<CategoryInput>();
  const [editing, setEditing] = useState<Category>();
  const [deleting, setDeleting] = useState<Category>();
  const fail = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) onExpired();
    else { setError(err instanceof Error ? err.message : "Unable to load categories."); if (err instanceof ApiError && err.status === 412) setStale(true); }
  }, [onExpired]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api.categories()); } catch (err) { fail(err); } finally { setLoading(false); }
  }, [fail]);
  useEffect(() => { void load(); }, [load]);
  async function action(run: () => Promise<unknown>, message: string) {
    setPending(true); setError(""); setNotice("");
    try { await run(); setForm(undefined); setEditing(undefined); setDeleting(undefined); setNotice(message); await load(); }
    catch (err) { fail(err); } finally { setPending(false); }
  }
  function start(category?: Category) {
    setEditing(category); setStale(false); setError(""); setNotice("");
    setForm(category ? { name: category.name, type: category.type, parentId: category.parentId } : { name: "", type: "SPENDING", parentId: null });
  }
  async function save(event: FormEvent) { event.preventDefault(); if (form) await action(() => api.saveCategory(form, editing), "Category saved."); }
  async function logout() {
    setPending(true);
    try { await api.logout(); onLogout(); } catch (err) { if (err instanceof ApiError && err.status === 401) onLogout(); else fail(err); } finally { setPending(false); }
  }
  const items = data?.items ?? [];
  const locked = !!editing && (editing.hasActivity || editing.hasChildren);
  const parents = items.filter(c => !c.parentId && c.type === form?.type && c.id !== editing?.id && (c.active || c.id === editing?.parentId));
  const busy = pending || loading || !!form || !!deleting;
  const visible = (c: Category) => archived ? !c.available : c.available;
  return <main className="workspace">
    <div className="workspace-heading"><div><p className="eyebrow">Your workspace</p><h1>Categories</h1><p className="muted">{user.email}</p></div><button className="secondary" disabled={pending} onClick={() => void logout()}>Sign out</button></div>
    <p>Organize income and spending. Expenses and refunds share spending categories; transfers have none.</p>
    <div className="section-heading"><button disabled={busy || !data} onClick={() => start()}>Create category</button><button className="secondary" disabled={pending || loading} onClick={() => void load()}>Refresh categories</button></div>
    {error && <div role="alert" className="error"><p>{error}</p><button disabled={pending || loading} onClick={() => void load()}>Retry / reload categories</button></div>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {loading && <p role="status">Loading categories…</p>}
    {form && <section className="panel create-panel"><h2>{editing ? "Edit category" : "New category"}</h2><form onSubmit={event => void save(event)}><fieldset disabled={pending} className="form-grid">
      <div><label htmlFor="category-name">Category name</label><input id="category-name" autoFocus required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></div>
      <div><label htmlFor="category-type">Category type</label><select id="category-type" disabled={locked} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CategoryType, parentId: null })}><option value="INCOME">Income</option><option value="SPENDING">Spending</option></select></div>
      <div><label htmlFor="category-parent">Parent category (optional)</label><select id="category-parent" disabled={locked} value={form.parentId ?? ""} onChange={e => setForm({ ...form, parentId: e.target.value || null })}><option value="">Top-level category</option>{parents.map(c => <option key={c.id} value={c.id}>{c.name}{!c.active ? " (archived)" : ""}</option>)}</select></div>
      {locked && <p className="help">Type and parent are locked because this category has history or subcategories. Its name can still change.</p>}
      {stale && <p role="status">This category changed. Your input is retained; cancel and reload before editing again.</p>}
      <div className="form-actions form-wide"><button disabled={stale}>Save category</button><button type="button" className="secondary" onClick={() => { setForm(undefined); setEditing(undefined); setStale(false); void load(); }}>Cancel</button></div>
    </fieldset></form></section>}
    {deleting && <section className="panel"><h2>Delete {deleting.name}?</h2><p>This unused category will be permanently removed. Its audit history is retained.</p>{stale && <p>Cancel and reload before trying again.</p>}<div className="form-actions"><button disabled={pending || stale} onClick={() => void action(() => api.deleteCategory(deleting), "Category deleted.")}>Confirm deletion</button><button className="secondary" disabled={pending} onClick={() => { setDeleting(undefined); setStale(false); void load(); }}>Cancel deletion</button></div></section>}
    {data && !loading && <>
      {items.length === 0 && <section className="panel empty-state"><h2>Make categories your own</h2><p>{data.starterSetAvailable ? "Create your categories, or add an editable starter set." : "Create categories to organize your transactions."}</p>{data.starterSetAvailable && <button disabled={busy} onClick={() => void action(api.installCategoryStarters, "Starter categories added.")}>Add starter categories</button>}</section>}
      <div className="account-filter" aria-label="Category status"><button className="secondary" disabled={pending} aria-pressed={!archived} onClick={() => setArchived(false)}>Active categories</button><button className="secondary" disabled={pending} aria-pressed={archived} onClick={() => setArchived(true)}>Archived categories</button></div>
      {(["INCOME", "SPENDING"] as CategoryType[]).map(type => <section key={type} aria-labelledby={`categories-${type}`}><h2 id={`categories-${type}`}>{type === "INCOME" ? "Income" : "Spending"}</h2>
        {!items.some(c => c.type === type && visible(c)) && <p>No {archived ? "archived" : "active"} {type.toLowerCase()} categories.</p>}
        {items.filter(c => c.type === type && !c.parentId).map(parent => <div key={parent.id} className="category-branch">{[parent, ...items.filter(c => c.parentId === parent.id)].filter(visible).map(c => <article className={`panel category-card ${c.parentId ? "category-child" : ""}`} key={c.id}>
          <h3>{categoryLabel(c, items)}</h3>{!c.active ? <p className="muted">Archived</p> : !c.available ? <p className="muted">Unavailable while parent is archived</p> : null}
          <div className="form-actions"><button className="secondary" disabled={busy} onClick={() => start(c)}>Edit category</button><button className="secondary" disabled={busy} onClick={() => void action(() => api.setCategoryActive(c, !c.active), c.active ? "Category archived." : "Category restored.")}>{c.active ? "Archive" : "Restore"}</button><button className="secondary" disabled={busy || c.hasActivity || c.hasChildren} onClick={() => { setDeleting(c); setStale(false); setError(""); }}>Delete</button></div>
          {(c.hasActivity || c.hasChildren) && <p className="help">Archive to retain history and subcategories.</p>}
        </article>)}</div>)}
      </section>)}
    </>}
  </main>;
}
