import type { LedgerKind } from "../../../types/models";
import type { AccountDetailViewModel } from "../../../types/viewModels";
import { categoryLabel } from "../../../utils/categoryPresentation";
import { Button, Input, Link, LoadingIndicator, Select, Textarea } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Confirmation } from "../../molecules/Confirmation";
import { Field } from "../../molecules/Field";

export function AccountDetailView({
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
}: AccountDetailViewModel) {
  return (
    <>
      <Button variant="secondary" disabled={pending} onClick={onBack}>
        Back to accounts
      </Button>
      {account && (
        <>
          <h1>{account.name}</h1>
          <p className="balance">
            {account.currency}{" "}
            {account.type === "CREDIT_CARD" && balance.startsWith("-") ? balance.slice(1) : balance}
          </p>
          <p>
            {account.type === "CREDIT_CARD" && balance.startsWith("-")
              ? "Amount owed"
              : account.type === "INVESTMENT"
                ? "Current cash balance"
                : "Current balance"}{" "}
            · {account.balanceAsOf}
          </p>
          <p>
            Opening {account.type === "INVESTMENT" ? "cash balance" : "balance"}: {account.currency}{" "}
            {account.openingBalance} · {account.openingDate}
          </p>
          {!account.active && (
            <p className="notice">
              Archived activity is read-only. Restore this account from Accounts to make changes.
            </p>
          )}
          <ActionGroup className="form-actions">
            <Button disabled={!account.active || pending} onClick={() => start("EXPENSE")}>
              Add transaction
            </Button>
            <Button
              disabled={
                !account.active ||
                pending ||
                !active.some((a) => a.id !== id && a.currency === account.currency)
              }
              onClick={() => start("TRANSFER")}
            >
              Transfer money
            </Button>
          </ActionGroup>
          {!active.some((a) => a.id !== id && a.currency === account.currency) && (
            <p>
              No other active account uses {account.currency}. Create or restore one to transfer
              money.
            </p>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button onClick={() => void load()}>Retry / reload activity</Button>
        </div>
      )}
      {form && (
        <section className="panel">
          <h2>
            {editing
              ? "Edit activity"
              : form.kind === "TRANSFER"
                ? "Transfer money"
                : "Add transaction"}
          </h2>
          <form onSubmit={(e) => void save(e)}>
            <fieldset disabled={pending} className="form-grid">
              <div>
                <label htmlFor="ledger-account">
                  {form.kind === "TRANSFER" ? "Source account" : "Account"}
                </label>
                <Select
                  id="ledger-account"
                  value={form.accountId}
                  onChange={(e) =>
                    setForm({ ...form, accountId: e.target.value, destinationAccountId: "" })
                  }
                >
                  {active.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              {form.kind === "TRANSFER" ? (
                <div>
                  <label htmlFor="ledger-destination">Destination account</label>
                  <Select
                    id="ledger-destination"
                    required
                    value={form.destinationAccountId ?? ""}
                    onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value })}
                  >
                    <option value="">Choose account</option>
                    {destinations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <label htmlFor="ledger-kind">Kind</label>
                  <Select
                    id="ledger-kind"
                    value={form.kind}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        kind: e.target.value as LedgerKind,
                        categoryId:
                          (form.kind === "INCOME") === (e.target.value === "INCOME")
                            ? form.categoryId
                            : null,
                      })
                    }
                  >
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                    <option value="REFUND">Refund (reduces spending)</option>
                  </Select>
                </div>
              )}
              {form.kind !== "TRANSFER" && (
                <div>
                  <label htmlFor="ledger-category">Category (optional)</label>
                  <Select
                    id="ledger-category"
                    value={form.categoryId ?? ""}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}
                  >
                    <option value="">Uncategorized</option>
                    {categories
                      .filter(
                        (c) =>
                          c.type === (form.kind === "INCOME" ? "INCOME" : "SPENDING") &&
                          (c.available || c.id === editing?.categoryId),
                      )
                      .sort((a, b) =>
                        categoryLabel(a, categories).localeCompare(categoryLabel(b, categories)),
                      )
                      .map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={!c.available && c.id !== form.categoryId}
                        >
                          {categoryLabel(c, categories)}
                          {!c.available ? " (archived)" : ""}
                        </option>
                      ))}
                  </Select>
                  <Link href="#/categories">Manage categories</Link>
                  {editing?.category && !editing.category.available && (
                    <p className="help">
                      This archived assignment can be kept or cleared. Restore the category and its
                      parent to assign it again.
                    </p>
                  )}
                </div>
              )}
              <Field htmlFor="ledger-amount" label={<> Amount ({source?.currency}) </>}>
                <Input
                  id="ledger-amount"
                  inputMode="decimal"
                  required
                  pattern="[0-9]{1,20}(\.[0-9]{1,8})?"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field htmlFor="ledger-date" label={"Transaction date"}>
                <Input
                  id="ledger-date"
                  type="date"
                  required
                  min={source?.openingDate}
                  max={account?.balanceAsOf}
                  value={form.transactionDate}
                  onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                />
              </Field>
              {form.kind !== "TRANSFER" && (
                <>
                  <Field htmlFor="ledger-value" label={"Value date (optional)"}>
                    <Input
                      id="ledger-value"
                      type="date"
                      value={form.valueDate ?? ""}
                      onChange={(e) => setForm({ ...form, valueDate: e.target.value || null })}
                    />
                  </Field>
                  <Field htmlFor="ledger-payee" label={"Payee (optional)"}>
                    <Input
                      id="ledger-payee"
                      maxLength={200}
                      value={form.payee ?? ""}
                      onChange={(e) => setForm({ ...form, payee: e.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field htmlFor="ledger-description" label={"Description"}>
                <Input
                  id="ledger-description"
                  required
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <Field htmlFor="ledger-notes" label={"Notes (optional)"}>
                <Textarea
                  id="ledger-notes"
                  maxLength={2000}
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
              {stale && (
                <p>
                  Activity changed. Cancel and reload before editing again. Your input is retained
                  here.
                </p>
              )}
              <ActionGroup className="form-actions">
                <Button disabled={stale}>Save activity</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setForm(undefined);
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
        <Confirmation className="panel" title={<>Delete {deleting.description}?</>}>
          <p>
            {deleting.kind === "TRANSFER"
              ? "Both sides of this transfer will be removed from account balances."
              : "This entry will be removed from the account balance."}{" "}
            Audit history is retained.
          </p>
          <Button disabled={pending || stale} onClick={() => void remove()}>
            Confirm deletion
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setDeleting(undefined);
              setStale(false);
            }}
          >
            Cancel deletion
          </Button>
        </Confirmation>
      )}
      <h2>Activity</h2>
      {loading ? (
        <LoadingIndicator role="status">Loading activity…</LoadingIndicator>
      ) : items.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        items.map((op) => (
          <article className="panel" key={op.id}>
            <h3>{op.description}</h3>
            <p>
              {op.transactionDate} · {op.kind} · {op.currency} {op.amount}
            </p>
            {op.kind !== "TRANSFER" && (
              <p>
                Category:{" "}
                {op.category
                  ? `${op.category.parentName ? `${op.category.parentName} → ` : ""}${op.category.name}${!op.category.available ? " (archived)" : ""}`
                  : "Uncategorized"}
              </p>
            )}
            {op.kind === "TRANSFER" && (
              <p>
                {op.accountId === id ? "To" : "From"}{" "}
                {
                  accounts.find(
                    (a) => a.id === (op.accountId === id ? op.destinationAccountId : op.accountId),
                  )?.name
                }
              </p>
            )}
            {op.valueDate && <p>Value date: {op.valueDate}</p>}
            {op.payee && <p>{op.payee}</p>}
            {op.notes && <p>{op.notes}</p>}
            <ActionGroup className="form-actions">
              <Button
                variant="secondary"
                disabled={!canChange(op) || pending || !!form}
                onClick={() => start(op.kind, op)}
              >
                Edit entry
              </Button>
              <Button
                variant="secondary"
                disabled={!canChange(op) || pending || !!form}
                onClick={() => {
                  setDeleting(op);
                  setStale(false);
                  setError("");
                }}
              >
                Delete entry
              </Button>
            </ActionGroup>
            {!canChange(op) && <p>Restore all affected accounts to change this activity.</p>}
          </article>
        ))
      )}
      <ActionGroup className="form-actions">
        <Button
          disabled={page === 0 || loading || pending || !!form}
          onClick={() => setPage(page - 1)}
        >
          Previous page
        </Button>
        <span>Page {page + 1}</span>
        <Button disabled={!more || loading || pending || !!form} onClick={() => setPage(page + 1)}>
          Next page
        </Button>
      </ActionGroup>
    </>
  );
}
