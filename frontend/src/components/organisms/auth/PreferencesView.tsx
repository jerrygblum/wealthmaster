import { Button, Input, LoadingIndicator } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Confirmation } from "../../molecules/Confirmation";
import type { PreferencesViewModel } from "../../../types/viewModels";
export function PreferencesView({
  data,
  currency,
  setCurrency,
  loading,
  pending,
  error,
  notice,
  confirming,
  setConfirming,
  stale,
  load,
  save,
}: PreferencesViewModel) {
  return (
    <section className="panel" aria-labelledby="currency-settings">
      <h2 id="currency-settings">Default currency</h2>
      <p>
        Spending limits use this currency. Foreign-currency spending stays separate until historical
        exchange-rate conversion is available.
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
              <fieldset disabled={pending || confirming} className="form-grid">
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
          {confirming && (
            <Confirmation title={<>Change default currency to {currency}?</>}>
              <p>
                You must enter your spending limits again in the new currency. All current category
                limits will be cleared, including their use in past reports. Ledger and audit
                history are retained.
              </p>
              <ActionGroup className="form-actions">
                <Button disabled={pending || stale} onClick={() => void save(true)}>
                  Confirm currency change
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setConfirming(false);
                    setCurrency(data?.defaultCurrency ?? "");
                  }}
                >
                  Cancel currency change
                </Button>
              </ActionGroup>
            </Confirmation>
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
