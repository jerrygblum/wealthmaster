import type { SpendingLimitEditorViewModel } from "../../../types/viewModels";
import { Button, Input, Radio } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";

export function SpendingLimitEditorView({
  amount,
  setAmount,
  scope,
  setScope,
  pending,
  error,
  stale,
  reset,
  setReset,
  periodLabel,
  current,
  save,
  categoryId,
  label,
  currency,
  periodType,
  periodStart,
  comparison,
  available,
  onCancel,
}: SpendingLimitEditorViewModel) {
  return (
    <section className="limit-editor" aria-label={`Edit ${label} ${periodLabel} limit`}>
      <h3>
        {label} · {periodLabel} {periodType === "MONTH" ? "monthly" : "yearly"} limit
      </h3>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={pending}>
          <label>
            Limit for {periodLabel} ({currency})
            <Input
              focusOnMount
              required
              inputMode="decimal"
              pattern="[0-9]{1,20}(\.[0-9]{1,8})?"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {current && (
            <fieldset className="save-scope">
              <legend>Apply this change</legend>
              <label>
                <Radio
                  name={`scope-${categoryId}-${periodStart}`}
                  checked={scope === "PERIOD"}
                  onChange={() => setScope("PERIOD")}
                />{" "}
                Only {periodLabel}
              </label>
              <label>
                <Radio
                  name={`scope-${categoryId}-${periodStart}`}
                  checked={scope === "NORMAL"}
                  disabled={!available && comparison?.source !== "NORMAL"}
                  onChange={() => setScope("NORMAL")}
                />{" "}
                Make this the normal {periodType === "MONTH" ? "monthly" : "yearly"} limit
              </label>
              <p className="muted">
                A normal change applies to the current and future periods. Earlier periods and other
                exceptions are retained.
              </p>
            </fieldset>
          )}
          {stale && <p>Your input is retained. Cancel and reload before trying again.</p>}
          <ActionGroup className="form-actions">
            <Button disabled={stale || (!available && !comparison?.overrideReference)}>
              Save limit
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel limit edit
            </Button>
            {comparison?.overrideReference && (
              <Button
                type="button"
                variant="secondary"
                disabled={stale}
                onClick={() => setReset(true)}
              >
                Use normal limit
              </Button>
            )}
          </ActionGroup>
        </fieldset>
      </form>
      {reset && (
        <div>
          <p>Remove this period exception and use the applicable normal setting?</p>
          <Button disabled={pending || stale} onClick={() => void save(true)}>
            Confirm reset
          </Button>
          <Button disabled={pending} onClick={() => setReset(false)}>
            Keep exception
          </Button>
        </div>
      )}
    </section>
  );
}
