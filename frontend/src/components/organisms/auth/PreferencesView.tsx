import { Button, Input, LoadingIndicator } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { ActionGroup } from "../../molecules/ActionGroup";
import type { PreferencesViewModel } from "../../../types/viewModels";
export function PreferencesView({
  data,
  currency,
  setCurrency,
  loading,
  pending,
  error,
  notice,
  stale,
  load,
  save,
}: PreferencesViewModel) {
  return (
    <section className="panel" aria-labelledby="currency-settings">
      <h2 id="currency-settings">Default currency</h2>
      <p>
        Save your preferred currency. Spending is reported in each transaction’s currency; no
        exchange-rate conversion is applied.
      </p>
      {loading ? (
        <LoadingIndicator>Loading currency settings…</LoadingIndicator>
      ) : (
        <>
          {data && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={pending} className="form-grid">
                <Field htmlFor="default-currency" label="Default currency (ISO code)">
                  <Input
                    id="default-currency"
                    required
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    placeholder="e.g. CHF"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </Field>
                <ActionGroup className="form-actions">
                  <Button disabled={stale || currency === data.defaultCurrency}>
                    Save default currency
                  </Button>
                </ActionGroup>
              </fieldset>
            </form>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button disabled={pending} onClick={() => void load()}>
            Reload currency settings
          </Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
