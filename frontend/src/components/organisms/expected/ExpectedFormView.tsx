import type { ExpectedPageViewModel } from "../../../types/viewModels";
import type { ExpectedKind } from "../../../types/models";
import { categoryLabel } from "../../../utils/categoryPresentation";
import { Button, Input, Select, Textarea } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { ActionGroup } from "../../molecules/ActionGroup";

export function ExpectedFormView({
  form,
  setForm,
  editing,
  accounts,
  categories,
  pending,
  stale,
  save,
  close,
}: ExpectedPageViewModel) {
  if (!form) return null;
  const transfer = form.kind === "TRANSFER";
  const source = accounts.find((a) => a.id === form.accountId);
  return (
    <section className="panel expected-editor">
      <h2>{editing ? "Edit recurring item" : "Add recurring item"}</h2>
      {editing && (
        <p className="help">
          Changes apply to every month, including past months. Confirmed links and skipped months
          are retained.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={pending} className="form-grid">
          <Field htmlFor="expected-name" label="Name">
            <Input
              id="expected-name"
              required
              maxLength={100}
              focusOnMount
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field htmlFor="expected-kind" label="Type">
            <Select
              id="expected-kind"
              value={form.kind}
              onChange={(e) =>
                setForm({
                  ...form,
                  kind: e.target.value as ExpectedKind,
                  categoryId: null,
                  destinationAccountId: null,
                })
              }
            >
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="TRANSFER">Transfer</option>
            </Select>
          </Field>
          <Field htmlFor="expected-account" label={transfer ? "Source account" : "Account"}>
            <Select
              id="expected-account"
              required
              value={form.accountId}
              onChange={(e) =>
                setForm({ ...form, accountId: e.target.value, destinationAccountId: null })
              }
            >
              <option value="">Choose account</option>
              {accounts
                .filter((a) => a.active || a.id === form.accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                    {!a.active ? " (archived)" : ""}
                  </option>
                ))}
            </Select>
          </Field>
          {transfer ? (
            <Field htmlFor="expected-destination" label="Destination account">
              <Select
                id="expected-destination"
                required
                value={form.destinationAccountId ?? ""}
                onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value || null })}
              >
                <option value="">Choose account</option>
                {accounts
                  .filter(
                    (a) =>
                      a.id !== form.accountId &&
                      a.currency === source?.currency &&
                      (a.active || a.id === form.destinationAccountId),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {!a.active ? " (archived)" : ""}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : (
            <Field htmlFor="expected-category" label="Category (optional)">
              <Select
                id="expected-category"
                value={form.categoryId ?? ""}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}
              >
                <option value="">Uncategorized</option>
                {categories
                  .filter(
                    (c) =>
                      c.type === (form.kind === "INCOME" ? "INCOME" : "SPENDING") &&
                      (c.available || c.id === form.categoryId),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(c, categories)}
                      {!c.available ? " (archived)" : ""}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field
            htmlFor="expected-amount"
            label={`Monthly amount (${source?.currency ?? "choose account"})`}
          >
            <Input
              id="expected-amount"
              inputMode="decimal"
              required
              pattern="[0-9]{1,20}(\.[0-9]{1,8})?"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field htmlFor="expected-day" label="Day of month">
            <Input
              id="expected-day"
              type="number"
              min={1}
              max={31}
              required
              value={form.dayOfMonth || ""}
              onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })}
            />
            <p className="help">Days beyond month end use its last day.</p>
          </Field>
          <Field htmlFor="expected-first" label="First month">
            <Input
              id="expected-first"
              type="month"
              min="0001-01"
              max="9999-12"
              required
              value={form.firstMonth.slice(0, 7)}
              onChange={(e) =>
                setForm({ ...form, firstMonth: e.target.value ? `${e.target.value}-01` : "" })
              }
            />
          </Field>
          <Field htmlFor="expected-last" label="Last month (optional)">
            <Input
              id="expected-last"
              type="month"
              min={form.firstMonth.slice(0, 7) || "0001-01"}
              max="9999-12"
              value={form.lastMonth?.slice(0, 7) ?? ""}
              onChange={(e) =>
                setForm({ ...form, lastMonth: e.target.value ? `${e.target.value}-01` : null })
              }
            />
          </Field>
          {!transfer && (
            <Field htmlFor="expected-payee" label="Payee (optional)">
              <Input
                id="expected-payee"
                maxLength={200}
                value={form.payee ?? ""}
                onChange={(e) => setForm({ ...form, payee: e.target.value })}
              />
            </Field>
          )}
          <Field htmlFor="expected-notes" label="Notes (optional)">
            <Textarea
              id="expected-notes"
              maxLength={2000}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {stale && <p role="status">Cancel and reload before saving. Your input is retained.</p>}
          <ActionGroup className="form-actions">
            <Button disabled={stale}>Save recurring item</Button>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
          </ActionGroup>
        </fieldset>
      </form>
    </section>
  );
}

export function ExpectedRecordForm({
  selected,
  recordForm,
  setRecordForm,
  accounts,
  categories,
  pending,
  stale,
  saveRecord,
  close,
  report,
}: ExpectedPageViewModel) {
  if (!recordForm || !selected || !report) return null;
  const d = selected.definition;
  const opening =
    accounts
      .filter((a) => a.id === d.accountId || a.id === d.destinationAccountId)
      .map((a) => a.openingDate)
      .sort()
      .at(-1) ?? report.month;
  const last = new Date(`${report.month}T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const lastDate = last.toISOString().slice(0, 10);
  return (
    <section className="panel expected-editor">
      <h2>Record {d.name}</h2>
      <p className="help">
        Review before saving. This creates actual ledger activity and confirms the match.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveRecord();
        }}
      >
        <fieldset disabled={pending} className="form-grid">
          <Field htmlFor="record-amount" label={`Actual amount (${d.currency})`}>
            <Input
              id="record-amount"
              focusOnMount
              required
              inputMode="decimal"
              pattern="[0-9]{1,20}(\.[0-9]{1,8})?"
              value={recordForm.amount}
              onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
            />
          </Field>
          <Field htmlFor="record-date" label="Transaction date">
            <Input
              id="record-date"
              required
              type="date"
              min={opening > report.month ? opening : report.month}
              max={lastDate < report.businessDate ? lastDate : report.businessDate}
              value={recordForm.transactionDate}
              onChange={(e) => setRecordForm({ ...recordForm, transactionDate: e.target.value })}
            />
          </Field>
          {d.kind !== "TRANSFER" && (
            <>
              <Field htmlFor="record-category" label="Category (optional)">
                <Select
                  id="record-category"
                  value={recordForm.categoryId ?? ""}
                  onChange={(e) =>
                    setRecordForm({ ...recordForm, categoryId: e.target.value || null })
                  }
                >
                  <option value="">Uncategorized</option>
                  {categories
                    .filter(
                      (c) =>
                        c.available && c.type === (d.kind === "INCOME" ? "INCOME" : "SPENDING"),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryLabel(c, categories)}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field htmlFor="record-payee" label="Payee (optional)">
                <Input
                  id="record-payee"
                  maxLength={200}
                  value={recordForm.payee}
                  onChange={(e) => setRecordForm({ ...recordForm, payee: e.target.value })}
                />
              </Field>
              <Field htmlFor="record-value" label="Value date (optional)">
                <Input
                  id="record-value"
                  type="date"
                  min={opening}
                  max={report.businessDate}
                  value={recordForm.valueDate ?? ""}
                  onChange={(e) =>
                    setRecordForm({ ...recordForm, valueDate: e.target.value || null })
                  }
                />
              </Field>
            </>
          )}
          <Field htmlFor="record-description" label="Description">
            <Input
              id="record-description"
              required
              maxLength={500}
              value={recordForm.description}
              onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
            />
          </Field>
          <Field htmlFor="record-notes" label="Notes (optional)">
            <Textarea
              id="record-notes"
              maxLength={2000}
              value={recordForm.notes}
              onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
            />
          </Field>
          {stale && <p role="status">Cancel and reload before saving. Your input is retained.</p>}
          <ActionGroup className="form-actions">
            <Button disabled={stale}>Save actual transaction</Button>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
          </ActionGroup>
        </fieldset>
      </form>
    </section>
  );
}
