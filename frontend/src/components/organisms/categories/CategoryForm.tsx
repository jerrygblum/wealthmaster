import { displayAmount } from "../../../utils/accountPresentation";
import { convertLimit } from "../../../utils/limitPresentation";
import { Button, Input, Link, Select } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { ActionGroup } from "../../molecules/ActionGroup";
import type { BudgetMode, CategoryType } from "../../../types/models";
import type { CategoriesPageViewModel } from "../../../types/viewModels";

export function CategoryForm({ model }: { model: CategoriesPageViewModel }) {
  const {
    form,
    setForm,
    editing,
    pending,
    locked,
    parents,
    stale,
    save,
    cancelForm,
    preferences,
    limitsLoading,
    limitsError,
    limitMode,
    setLimitMode,
    limitAmount,
    setLimitAmount,
    originalLimit,
    limitSource,
  } = model;
  if (!form) return null;
  const unavailable = !!editing && !editing.available;
  return (
    <form onSubmit={(e) => void save(e)} aria-label={editing ? "Edit category" : "New category"}>
      <h3>{editing ? "Edit category" : "New category"}</h3>
      <fieldset disabled={pending} className="form-grid">
        <Field htmlFor="category-name" label="Category name">
          <Input
            id="category-name"
            focusOnMount
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field htmlFor="category-type" label="Category type">
          <Select
            id="category-type"
            disabled={locked}
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as CategoryType, parentId: null })
            }
          >
            <option value="SPENDING">Spending</option>
            <option value="INCOME">Income</option>
          </Select>
        </Field>
        <Field htmlFor="category-parent" label="Parent category (optional)">
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
        </Field>
        {form.type === "SPENDING" && !form.parentId && (
          <div className="form-wide category-limit-fields">
            <Field htmlFor="category-limit-mode" label="Spending limit">
              <Select
                id="category-limit-mode"
                value={limitMode}
                disabled={limitsLoading || !!limitsError}
                onChange={(e) => setLimitMode(e.target.value as BudgetMode)}
              >
                <option value="NONE">No limit</option>
                <option
                  value="MONTH"
                  disabled={
                    !preferences?.defaultCurrency ||
                    (unavailable && (!originalLimit || originalLimit.mode === "NONE"))
                  }
                >
                  Monthly
                </option>
                <option
                  value="YEAR"
                  disabled={
                    !preferences?.defaultCurrency ||
                    (unavailable && (!originalLimit || originalLimit.mode === "NONE"))
                  }
                >
                  Yearly
                </option>
              </Select>
            </Field>
            {limitMode !== "NONE" && (
              <Field
                htmlFor="category-limit-amount"
                label={`Amount (${preferences?.defaultCurrency ?? "currency unavailable"})`}
              >
                <Input
                  id="category-limit-amount"
                  required
                  inputMode="decimal"
                  pattern={
                    limitMode !== limitSource.mode
                      ? "[0-9]{1,21}([.][0-9]{1,8})?"
                      : "[0-9]{1,20}([.][0-9]{1,8})?"
                  }
                  value={limitAmount}
                  disabled={limitsLoading || !!limitsError}
                  onChange={(e) => setLimitAmount(e.target.value)}
                />
              </Field>
            )}
            {limitMode !== "NONE" && /^[0-9]{1,21}([.][0-9]{1,8})?$/.test(limitAmount) && (
              <p className="help" aria-live="polite">
                {displayAmount(
                  convertLimit(
                    limitSource.amount,
                    limitSource.mode,
                    limitMode === "MONTH" ? "YEAR" : "MONTH",
                  ),
                )}{" "}
                {preferences?.defaultCurrency} / {limitMode === "MONTH" ? "year" : "month"}
              </p>
            )}
            {!preferences?.defaultCurrency && !limitsLoading && !limitsError && (
              <p>
                Choose your <Link href="#/settings">default currency in Settings</Link> to enable a
                spending limit.
              </p>
            )}
            {(limitsLoading || limitsError) && (
              <p>
                Limit fields are unavailable. Saving category details preserves existing limits.
              </p>
            )}
            {preferences?.defaultCurrency && !limitsError && (
              <p className="help">
                Limits include spending in subcategories, use {preferences.defaultCurrency} and
                apply to every selected month and year, including past periods.
              </p>
            )}
          </div>
        )}
        {form.type === "SPENDING" && form.parentId && (
          <p className="help form-wide">
            Spending in this subcategory counts toward its main category’s limit.
          </p>
        )}
        {locked && (
          <p className="help form-wide">
            Type and parent are locked because this category has ledger or budget history or
            subcategories. Its name can still change.
          </p>
        )}
        {stale && (
          <p role="status" className="form-wide">
            This category or its limit changed. Your input is retained; cancel and reload before
            editing again.
          </p>
        )}
        <ActionGroup className="form-actions form-wide">
          <Button disabled={stale}>Save category</Button>
          <Button type="button" variant="secondary" onClick={cancelForm}>
            Cancel
          </Button>
        </ActionGroup>
      </fieldset>
    </form>
  );
}
