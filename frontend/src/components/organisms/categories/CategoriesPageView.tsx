import { Button, Input, LoadingIndicator, Select } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Confirmation } from "../../molecules/Confirmation";
import { Field } from "../../molecules/Field";
import { Message } from "../../molecules/Message";
import { WorkspaceHeading } from "../application/WorkspaceHeading";

import type { ComponentType } from "react";
import type { CategoryLimitsProps } from "../../../types/componentProps";
import type { CategoryType } from "../../../types/models";
import type { CategoriesPageViewModel } from "../../../types/viewModels";

import { categoryLabel } from "../../../utils/categoryPresentation";

export function CategoriesPageView({
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
  CategoryLimits,
}: CategoriesPageViewModel & { CategoryLimits: ComponentType<CategoryLimitsProps> }) {
  return (
    <>
      <WorkspaceHeading
        title={<>Categories</>}
        subtitle={<>{user.email}</>}
        actions={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => void logout()}>
              Sign out
            </Button>
          </>
        }
      />
      <p>
        Organize income and spending. Expenses and refunds share spending categories; transfers have
        none.
      </p>
      <div className="section-heading">
        <Button disabled={busy || !data} onClick={() => start()}>
          Create category
        </Button>
        <Button
          variant="secondary"
          disabled={pending || loading || limitsBusy}
          onClick={() => void load()}
        >
          Refresh categories
        </Button>
      </div>
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button disabled={pending || loading} onClick={() => void load()}>
            Retry / reload categories
          </Button>
        </div>
      )}
      {notice && (
        <Message role="status" className="notice">
          {notice}
        </Message>
      )}
      {loading && <LoadingIndicator role="status">Loading categories…</LoadingIndicator>}
      {form && (
        <section className="panel create-panel">
          <h2>{editing ? "Edit category" : "New category"}</h2>
          <form onSubmit={(event) => void save(event)}>
            <fieldset disabled={pending} className="form-grid">
              <Field htmlFor="category-name" label={"Category name"}>
                <Input
                  id="category-name"
                  focusOnMount
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <div>
                <label htmlFor="category-type">Category type</label>
                <Select
                  id="category-type"
                  disabled={locked}
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as CategoryType, parentId: null })
                  }
                >
                  <option value="INCOME">Income</option>
                  <option value="SPENDING">Spending</option>
                </Select>
              </div>
              <div>
                <label htmlFor="category-parent">Parent category (optional)</label>
                <Select
                  id="category-parent"
                  disabled={locked}
                  value={form.parentId ?? ""}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}
                >
                  <option value="">Top-level category</option>
                  {parents.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {!c.active ? " (archived)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              {locked && (
                <p className="help">
                  Type and parent are locked because this category has ledger or budget history or
                  subcategories. Its name can still change.
                </p>
              )}
              {stale && (
                <p role="status">
                  This category changed. Your input is retained; cancel and reload before editing
                  again.
                </p>
              )}
              <ActionGroup className="form-actions form-wide">
                <Button disabled={stale}>Save category</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setForm(undefined);
                    setEditing(undefined);
                    setStale(false);
                    void load();
                  }}
                >
                  Cancel
                </Button>
              </ActionGroup>
            </fieldset>
          </form>
        </section>
      )}
      {deleting && (
        <Confirmation className="panel" title={<>Delete {deleting.name}?</>}>
          <p>This unused category will be permanently removed. Its audit history is retained.</p>
          {stale && <p>Cancel and reload before trying again.</p>}
          <ActionGroup className="form-actions">
            <Button disabled={pending || stale} onClick={deleteCategory}>
              Confirm deletion
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setDeleting(undefined);
                setStale(false);
                void load();
              }}
            >
              Cancel deletion
            </Button>
          </ActionGroup>
        </Confirmation>
      )}
      {data && !loading && (
        <>
          {items.length === 0 && (
            <section className="panel empty-state">
              <h2>Make categories your own</h2>
              <p>
                {data.starterSetAvailable
                  ? "Create your categories, or add an editable starter set."
                  : "Create categories to organize your transactions."}
              </p>
              {data.starterSetAvailable && (
                <Button disabled={busy} onClick={installStarters}>
                  Add starter categories
                </Button>
              )}
            </section>
          )}
          <div className="account-filter" aria-label="Category status">
            <Button
              variant="secondary"
              disabled={pending || limitsBusy}
              aria-pressed={!archived}
              onClick={() => setArchived(false)}
            >
              Active categories
            </Button>
            <Button
              variant="secondary"
              disabled={pending || limitsBusy}
              aria-pressed={archived}
              onClick={() => setArchived(true)}
            >
              Archived categories
            </Button>
          </div>
          {(["INCOME", "SPENDING"] as CategoryType[]).map((type) => (
            <section key={type} aria-labelledby={`categories-${type}`}>
              <h2 id={`categories-${type}`}>{type === "INCOME" ? "Income" : "Spending"}</h2>
              {!items.some((c) => c.type === type && visible(c)) && (
                <p>
                  No {archived ? "archived" : "active"} {type.toLowerCase()} categories.
                </p>
              )}
              {type === "SPENDING" ? (
                <CategoryLimits
                  onChanged={refreshHistory}
                  onBusyChange={setLimitsBusy}
                  disabled={pending || !!form || !!deleting}
                  onExpired={onExpired}
                  categories={items
                    .filter((c) => c.type === type && visible(c))
                    .sort((a, b) => {
                      const aa = items.find((c) => c.id === a.parentId)?.name || a.name;
                      const bb = items.find((c) => c.id === b.parentId)?.name || b.name;
                      return (
                        aa.localeCompare(bb) ||
                        Number(!!a.parentId) - Number(!!b.parentId) ||
                        a.name.localeCompare(b.name)
                      );
                    })}
                  renderCategory={(c) => (
                    <>
                      <h3>{categoryLabel(c, items)}</h3>
                      {!c.active ? (
                        <p className="muted">Archived</p>
                      ) : !c.available ? (
                        <p className="muted">Unavailable while parent is archived</p>
                      ) : null}
                      <details className="category-actions">
                        <summary>Category actions</summary>
                        <ActionGroup className="form-actions">
                          <Button variant="secondary" disabled={busy} onClick={() => start(c)}>
                            Edit category
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => archiveCategory(c)}
                          >
                            {c.active ? "Archive" : "Restore"}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy || c.hasActivity || c.hasChildren}
                            onClick={() => {
                              setDeleting(c);
                              setStale(false);
                              setError("");
                            }}
                          >
                            Delete
                          </Button>
                        </ActionGroup>
                        {(c.hasActivity || c.hasChildren) && (
                          <p className="help">
                            Ledger and budget use permanently lock type and parent and prevent
                            deletion. Archive to retain history and subcategories.
                          </p>
                        )}
                      </details>
                    </>
                  )}
                />
              ) : (
                <>
                  {" "}
                  {items
                    .filter((c) => c.type === type && !c.parentId)
                    .map((parent) => (
                      <div key={parent.id} className="category-branch">
                        {[parent, ...items.filter((c) => c.parentId === parent.id)]
                          .filter(visible)
                          .map((c) => (
                            <article
                              className={`panel category-card ${c.parentId ? "category-child" : ""}`}
                              key={c.id}
                            >
                              <h3>{categoryLabel(c, items)}</h3>
                              {!c.active ? (
                                <p className="muted">Archived</p>
                              ) : !c.available ? (
                                <p className="muted">Unavailable while parent is archived</p>
                              ) : null}
                              <ActionGroup className="form-actions">
                                <Button
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => start(c)}
                                >
                                  Edit category
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => archiveCategory(c)}
                                >
                                  {c.active ? "Archive" : "Restore"}
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={busy || c.hasActivity || c.hasChildren}
                                  onClick={() => {
                                    setDeleting(c);
                                    setStale(false);
                                    setError("");
                                  }}
                                >
                                  Delete
                                </Button>
                              </ActionGroup>
                              {(c.hasActivity || c.hasChildren) && (
                                <p className="help">
                                  Ledger and budget use permanently lock type and parent and prevent
                                  deletion. Archive to retain history and subcategories.
                                </p>
                              )}
                            </article>
                          ))}
                      </div>
                    ))}
                </>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
