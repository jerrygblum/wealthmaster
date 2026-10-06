import type { BudgetCopyToolViewModel } from "../../../types/viewModels";
import { Button, Checkbox, Input } from "../../atoms/Controls";

export function BudgetCopyToolView({
  items,
  selected,
  setSelected,
  target,
  setTarget,
  loading,
  error,
  notice,
  load,
  copy,
  periodType,
}: BudgetCopyToolViewModel) {
  return (
    <details
      className="copy-exceptions"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Copy period exceptions</summary>
      <p>
        Normal settings recur automatically. Only explicit{" "}
        {periodType === "MONTH" ? "monthly" : "yearly"} exceptions are copied.
      </p>
      {error && (
        <p role="alert">
          {error}
          <Button onClick={() => void load()}>Reload exceptions</Button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loading && !items.length && <p>No explicit exceptions for this period.</p>}
      {items.map((b) => (
        <label key={b.id}>
          <Checkbox
            disabled={loading}
            checked={selected.includes(b.id)}
            onChange={(e) =>
              setSelected(
                e.target.checked ? [...selected, b.id] : selected.filter((id) => id !== b.id),
              )
            }
          />{" "}
          {b.categoryName} · {b.limit} {b.currency}
        </label>
      ))}
      {!!items.length && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void copy();
          }}
        >
          <label>
            Target period start
            <Input
              required
              type="date"
              value={target}
              disabled={loading}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <p>
            Use the first day of a {periodType === "MONTH" ? "month" : "year"}. Existing exceptions
            are retained.
          </p>
          <Button disabled={loading || !selected.length}>Copy selected exceptions</Button>
        </form>
      )}
    </details>
  );
}
