import { Button, Input, Select } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { ActionGroup } from "../../molecules/ActionGroup";
import type { CategoryType } from "../../../types/models";
import type { CategoriesPageViewModel } from "../../../types/viewModels";

export function CategoryForm({ model }: { model: CategoriesPageViewModel }) {
  const { form, setForm, editing, pending, locked, parents, stale, save, cancelForm } = model;
  if (!form) return null;
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
        {locked && (
          <p className="help form-wide">
            Type and parent are locked because this category has ledger history or subcategories.
            Its name can still change.
          </p>
        )}
        {stale && (
          <p role="status" className="form-wide">
            This category changed. Your input is retained; cancel and reload before editing again.
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
