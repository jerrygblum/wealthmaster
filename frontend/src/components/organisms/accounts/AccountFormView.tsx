import { Button, Input, Select } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Field } from "../../molecules/Field";

import type { AccountType, BalanceMeaning } from "../../../types/models";
import { accountTypes } from "../../../utils/accountPresentation";

import type { AccountFormViewModel } from "../../../types/viewModels";

export function AccountFormView({
  input,
  setInput,
  pending,
  error,
  fields,
  stale,
  locked,
  creditCard,
  change,
  submit,
  accessibility,
  account,
  onCancel,
}: AccountFormViewModel) {
  function fieldError(name: string) {
    return fields[name] ? (
      <span className="field-error" id={`${name}-error`}>
        {fields[name]}
      </span>
    ) : null;
  }
  return (
    <section className="panel create-panel" aria-labelledby="create-heading">
      <h2 id="create-heading">{account ? "Edit account" : "Create account"}</h2>
      {locked && (
        <p className="notice">
          Type, currency and opening amount are locked because this account has activity. You can
          change its name, institution and opening date.
        </p>
      )}
      {stale && <p role="status">Cancel and reload accounts before editing again.</p>}
      {input.type === "INVESTMENT" && (
        <p className="help">
          Enter uninvested cash only. Stocks and other holdings will be tracked separately.
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={pending} className="form-grid">
          <Field htmlFor="account-name" label={"Account name"}>
            <Input
              id="account-name"
              focusOnMount
              required
              maxLength={100}
              value={input.name}
              onChange={(event) => change("name", event.target.value)}
              {...accessibility("name")}
            />
            {fieldError("name")}
          </Field>
          <div>
            <label htmlFor="account-type">Account type</label>
            <Select
              disabled={locked}
              id="account-type"
              value={input.type}
              onChange={(event) => {
                const type = event.target.value as AccountType;
                setInput((previous) => ({
                  ...previous,
                  type,
                  balanceMeaning:
                    type === "CREDIT_CARD"
                      ? previous.openingAmount.startsWith("-") ||
                        /^0(?:\.0+)?$/.test(previous.openingAmount)
                        ? "AMOUNT_OWED"
                        : "IN_CREDIT"
                      : "BALANCE",
                  openingAmount:
                    type === "CREDIT_CARD"
                      ? previous.openingAmount.replace(/^-/, "")
                      : previous.type === "CREDIT_CARD" &&
                          previous.balanceMeaning === "AMOUNT_OWED" &&
                          !/^0(?:\.0+)?$/.test(previous.openingAmount)
                        ? `-${previous.openingAmount}`
                        : previous.openingAmount,
                }));
              }}
              {...accessibility("type")}
            >
              {Object.entries(accountTypes).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </Select>
            {fieldError("type")}
          </div>
          <Field
            htmlFor="institution"
            label={'Institution <span className="muted">(optional)</span>'}
          >
            <Input
              id="institution"
              maxLength={100}
              value={input.institution}
              onChange={(event) => change("institution", event.target.value)}
              {...accessibility("institution")}
            />
            {fieldError("institution")}
          </Field>
          <Field htmlFor="currency" label={"Currency"}>
            <Input
              disabled={locked}
              id="currency"
              required
              list="currency-options"
              placeholder="Choose or enter a code, e.g. CHF"
              maxLength={3}
              pattern="[A-Z]{3}"
              value={input.currency}
              onChange={(event) => change("currency", event.target.value.toUpperCase())}
              {...accessibility("currency")}
            />
            <datalist id="currency-options">
              {["CHF", "EUR", "USD", "GBP", "JPY", "CAD", "AUD"].map((currency) => (
                <option key={currency} value={currency} />
              ))}
            </datalist>
            {fieldError("currency")}
          </Field>
          {creditCard && (
            <div>
              <label htmlFor="balance-meaning">Credit-card position</label>
              <Select
                disabled={locked}
                id="balance-meaning"
                value={input.balanceMeaning}
                onChange={(event) => change("balanceMeaning", event.target.value as BalanceMeaning)}
              >
                <option value="AMOUNT_OWED">Amount owed</option>
                <option value="IN_CREDIT">In credit (overpayment)</option>
              </Select>
              {fieldError("balanceMeaning")}
            </div>
          )}
          <Field
            htmlFor="opening-amount"
            label={
              <>
                {" "}
                {creditCard
                  ? input.balanceMeaning === "AMOUNT_OWED"
                    ? "Opening amount owed"
                    : "Opening credit amount"
                  : input.type === "INVESTMENT"
                    ? "Opening cash balance"
                    : "Opening balance"}{" "}
              </>
            }
          >
            <Input
              disabled={locked}
              id="opening-amount"
              type="text"
              inputMode="decimal"
              required
              maxLength={40}
              pattern={creditCard ? "[0-9]{1,20}(\\.[0-9]{1,8})?" : "-?[0-9]{1,20}(\\.[0-9]{1,8})?"}
              value={input.openingAmount}
              onChange={(event) => change("openingAmount", event.target.value)}
              {...accessibility("openingAmount")}
            />
            <span className="help">
              {creditCard
                ? "Enter a positive amount or zero."
                : "Use a minus sign for a negative balance."}{" "}
              Use a decimal point.
            </span>
            {fieldError("openingAmount")}
          </Field>
          <Field htmlFor="opening-date" label={"Opening date"}>
            <Input
              id="opening-date"
              min="0001-01-01"
              max="9999-12-31"
              type="date"
              required
              value={input.openingDate}
              onChange={(event) => change("openingDate", event.target.value)}
              {...accessibility("openingDate")}
            />
            <span className="help">
              Balances include transactions from this date onward. Changing it recalculates net
              worth; spending keeps each transaction’s own date.
            </span>
            {fieldError("openingDate")}
          </Field>
          {error && (
            <p className="error form-wide" role="alert">
              {error}
            </p>
          )}
          <ActionGroup className="form-actions form-wide">
            <Button disabled={stale} type="submit">
              {pending ? "Saving…" : "Save account"}
            </Button>
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
          </ActionGroup>
        </fieldset>
      </form>
    </section>
  );
}
