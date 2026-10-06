import type { Draft } from "../../../types/budgetDraft";
import type { BudgetMode } from "../../../types/models";
import type { CategoryLimitsViewModel } from "../../../types/viewModels";
import { Button, Input, Link, LoadingIndicator } from "../../atoms/Controls";
import { SegmentedControl } from "../../molecules/ActionGroup";
const modes: { value: BudgetMode; label: string }[] = [
  { value: "NONE", label: "No limit" },
  { value: "MONTH", label: "Monthly" },
  { value: "YEAR", label: "Yearly" },
];

export function CategoryLimitsView({
  data,
  loading,
  pending,
  error,
  setError,
  notice,
  setNotice,
  draft,
  setDraft,
  stale,
  setStale,
  load,
  save,
  selected,
  categories,
  renderCategory,
  disabled,
}: CategoryLimitsViewModel) {
  return (
    <div className="normal-limits">
      <p className="muted budget-help">
        Normal limits apply from the current month or year onward. Change individual periods in{" "}
        <Link href="#/spending">Spending</Link>.
      </p>
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          {!draft && (
            <Button disabled={loading} onClick={() => void load()}>
              Retry normal limits
            </Button>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <LoadingIndicator role="status">Loading normal limits…</LoadingIndicator>}
      {categories.map((c) => {
        const settings = data?.items.filter((s) => s.categoryId === c.id) ?? [];
        const currencies = [
          ...new Set([
            ...settings.map((s) => s.currency),
            ...(draft?.categoryId === c.id ? [draft.currency] : []),
          ]),
        ];
        if (!currencies.length) currencies.push("CHF");
        return (
          <article
            id={`category-${c.id}`}
            data-selected={c.id === selected}
            tabIndex={-1}
            key={c.id}
            className={`panel category-card compact-category ${c.parentId ? "category-child" : ""}`}
          >
            {renderCategory(c)}
            {currencies.map((currency) => {
              const setting = settings.find((s) => s.currency === currency);
              const editing = draft?.categoryId === c.id && draft.currency === currency;
              const value = editing
                ? draft
                : {
                    categoryId: c.id,
                    currency,
                    mode: setting?.mode ?? "NONE",
                    limit: setting?.limit ?? "",
                    setting,
                  };
              const blocked = disabled || loading || !data || pending || (!!draft && !editing);
              function change(changes: Partial<Draft>) {
                setError("");
                setNotice("");
                if (!draft) setStale(false);
                setDraft({ ...value, ...changes });
              }
              return (
                <form
                  key={currency}
                  className="normal-limit-row"
                  aria-label={`Normal limit for ${c.name} ${currency}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <SegmentedControl
                    className="limit-mode"
                    role="group"
                    aria-label={`Limit frequency for ${c.name} ${currency}`}
                  >
                    {modes.map((m) => (
                      <Button
                        key={m.value}
                        type="button"
                        aria-pressed={value.mode === m.value}
                        disabled={
                          blocked ||
                          (!c.available && m.value !== "NONE" && m.value !== setting?.mode)
                        }
                        onClick={() => change({ mode: m.value })}
                      >
                        {m.label}
                      </Button>
                    ))}
                  </SegmentedControl>
                  {value.mode !== "NONE" && (
                    <label className="limit-amount">
                      <span className="sr-only">
                        Normal limit amount for {c.name} {currency}
                      </span>
                      <Input
                        required
                        focusOnMount={editing && !setting?.limit}
                        inputMode="decimal"
                        pattern="[0-9]{1,20}(\.[0-9]{1,8})?"
                        disabled={blocked}
                        value={value.limit}
                        onChange={(e) => change({ limit: e.target.value })}
                      />
                    </label>
                  )}
                  <span className="limit-currency">{currency}</span>
                  {editing && (
                    <>
                      <Button disabled={pending || stale || disabled}>Save normal limit</Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          setDraft(undefined);
                          setStale(false);
                          setError("");
                          if (stale) void load();
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </form>
              );
            })}
            {draft?.categoryId === c.id && stale && (
              <p role="status">
                This setting changed. Your input is retained; cancel and reload before saving.
              </p>
            )}
            <details className="currency-options">
              <summary>Other currencies</summary>
              <form
                className="form-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  const submittedCurrency = new FormData(e.currentTarget).get("currency");
                  const currency =
                    typeof submittedCurrency === "string" ? submittedCurrency.toUpperCase() : "";
                  if (settings.some((s) => s.currency === currency)) {
                    setError("This currency already has a normal setting.");
                    return;
                  }
                  setDraft({ categoryId: c.id, currency, mode: "MONTH", limit: "" });
                }}
              >
                <label>
                  Additional currency for {c.name}
                  <Input
                    name="currency"
                    required
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    disabled={disabled || loading || !data || pending || !!draft || !c.available}
                  />
                </label>
                <Button
                  disabled={disabled || loading || !data || pending || !!draft || !c.available}
                >
                  Add currency
                </Button>
              </form>
            </details>
          </article>
        );
      })}
    </div>
  );
}
