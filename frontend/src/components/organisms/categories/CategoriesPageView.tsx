import { ActionIcon } from "../../atoms/ActionIcon";
import { Button, Link, LoadingIndicator } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Confirmation } from "../../molecules/Confirmation";
import { Message } from "../../molecules/Message";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { CategoryForm } from "./CategoryForm";
import type { CategoryType } from "../../../types/models";
import type { CategoriesPageViewModel } from "../../../types/viewModels";
import { displayAmount } from "../../../utils/accountPresentation";
import { categoryLabel } from "../../../utils/categoryPresentation";

export function CategoriesPageView(model: CategoriesPageViewModel) {
  const {
    data,
    loading,
    pending,
    error,
    setError,
    notice,
    stale,
    setStale,
    archived,
    setArchived,
    form,
    editing,
    deleting,
    setDeleting,
    load,
    start,
    logout,
    items,
    busy,
    visible,
    deleteCategory,
    installStarters,
    archiveCategory,
    user,
    limitData,
    preferences,
    limitsLoading,
    limitsError,
    loadLimits,
  } = model;
  return (
    <>
      <WorkspaceHeading
        title={<>Categories</>}
        subtitle={<>{user.email}</>}
        actions={
          <Button variant="secondary" disabled={pending} onClick={() => void logout()}>
            Sign out
          </Button>
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
          disabled={busy}
          onClick={() => {
            void load();
            void loadLimits();
          }}
        >
          Refresh categories
        </Button>
      </div>
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button disabled={pending || !!form} onClick={() => void load()}>
            Retry / reload categories
          </Button>
        </div>
      )}
      {notice && (
        <Message role="status" className="notice">
          {notice}
        </Message>
      )}
      {loading && <LoadingIndicator>Loading categories…</LoadingIndicator>}
      {form && !editing && (
        <section className="panel create-panel">
          <CategoryForm model={model} />
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
              disabled={busy}
              aria-pressed={!archived}
              onClick={() => setArchived(false)}
            >
              Active categories
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              aria-pressed={archived}
              onClick={() => setArchived(true)}
            >
              Archived categories
            </Button>
          </div>
          {(["INCOME", "SPENDING"] as CategoryType[]).map((type) => (
            <section key={type} aria-labelledby={`categories-${type}`}>
              <h2 id={`categories-${type}`}>{type === "INCOME" ? "Income" : "Spending"}</h2>
              {type === "SPENDING" && (
                <>
                  {limitsLoading && <LoadingIndicator>Loading spending limits…</LoadingIndicator>}
                  {limitsError && (
                    <div role="alert" className="error">
                      <p>{limitsError}</p>
                      <Button disabled={pending || !!form} onClick={() => void loadLimits()}>
                        Retry spending limits
                      </Button>
                    </div>
                  )}
                  {preferences && !preferences.defaultCurrency && (
                    <p>
                      Select a <Link href="#/settings">default currency in Settings</Link> before
                      setting spending limits. Existing limits are retained until you confirm a
                      currency selection.
                    </p>
                  )}
                </>
              )}
              {!items.some((c) => c.type === type && visible(c)) && (
                <p>
                  No {archived ? "archived" : "active"} {type.toLowerCase()} categories.
                </p>
              )}
              {items.some((c) => c.type === type && visible(c)) && (
                <div className={`category-list ${type === "INCOME" ? "category-list-income" : ""}`}>
                  <div className="category-list-heading" aria-hidden="true">
                    <span>Category</span>
                    {type === "SPENDING" && <span>Spending limit</span>}
                    <span>Actions</span>
                  </div>
                  {items
                    .filter((c) => c.type === type && visible(c))
                    .sort((a, b) => {
                      const aa = items.find((c) => c.id === a.parentId)?.name || a.name;
                      const bb = items.find((c) => c.id === b.parentId)?.name || b.name;
                      return (
                        aa.localeCompare(bb) ||
                        Number(!!a.parentId) - Number(!!b.parentId) ||
                        a.name.localeCompare(b.name)
                      );
                    })
                    .map((c) => (
                      <article
                        key={c.id}
                        id={`category-${c.id}`}
                        data-selected={model.selectedCategory === c.id ? "true" : undefined}
                        className={`category-row ${c.parentId ? "category-row-child" : ""}`}
                      >
                        <div className="category-row-name">
                          <h3>{categoryLabel(c, items)}</h3>
                          {!c.active ? (
                            <span className="muted">Archived</span>
                          ) : !c.available ? (
                            <span className="muted">Unavailable while parent is archived</span>
                          ) : null}
                        </div>
                        {type === "SPENDING" && (
                          <div className="category-row-limit">
                            {c.parentId
                              ? `Included in ${items.find((parent) => parent.id === c.parentId)?.name ?? "main category"}’s limit`
                              : limitsLoading
                                ? "Loading…"
                                : limitsError
                                  ? "Limit unavailable"
                                  : limitData?.items
                                      .filter((s) => s.categoryId === c.id && s.mode !== "NONE")
                                      .map(
                                        (s) =>
                                          `${displayAmount(s.monthlyLimit ?? "0")} ${s.currency} / month · ${displayAmount(s.yearlyLimit ?? "0")} ${s.currency} / year`,
                                      )
                                      .join(" · ") || "No spending limit"}
                          </div>
                        )}
                        <ActionGroup className="category-row-actions">
                          <Button
                            variant="secondary"
                            className="category-action"
                            aria-label="Edit category"
                            title={`Edit ${categoryLabel(c, items)}`}
                            disabled={busy}
                            onClick={() => start(c)}
                          >
                            <ActionIcon action="edit" />
                          </Button>
                          <Button
                            variant="secondary"
                            className="category-action"
                            aria-label={c.active ? "Archive" : "Restore"}
                            title={`${c.active ? "Archive" : "Restore"} ${categoryLabel(c, items)}`}
                            disabled={busy}
                            onClick={() => archiveCategory(c)}
                          >
                            <ActionIcon action={c.active ? "archive" : "restore"} />
                          </Button>
                          <Button
                            variant="secondary"
                            className="category-action category-action-delete"
                            aria-label="Delete"
                            title={
                              c.hasActivity || c.hasChildren
                                ? "History or subcategories prevent deletion; archive instead."
                                : `Delete ${categoryLabel(c, items)}`
                            }
                            disabled={busy || c.hasActivity || c.hasChildren}
                            onClick={() => {
                              setDeleting(c);
                              setStale(false);
                              setError("");
                            }}
                          >
                            <ActionIcon action="delete" />
                          </Button>
                        </ActionGroup>
                        {editing?.id === c.id && form && (
                          <div className="category-row-editor">
                            <CategoryForm model={model} />
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
