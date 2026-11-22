import {
  Button,
  Checkbox,
  Input,
  Link,
  LoadingIndicator,
  Select,
  Textarea,
} from "../../atoms/Controls";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { Field } from "../../molecules/Field";
import type { InvestmentsViewModel } from "../../../types/viewModels";

export function InvestmentsView(model: InvestmentsViewModel) {
  const { data, account, form, preview, pending, loading, securityForm } = model;
  const busy = pending || loading;
  const name = (id: string) => data?.securities.find((s) => s.id === id)?.name ?? "Security";
  const security = data?.securities.find((s) => s.id === form?.securityId);
  return (
    <>
      <WorkspaceHeading title={account?.name ?? "Investments"} subtitle="Stocks and ETFs" />
      <nav className="form-actions" aria-label="Investment account views">
        <Link href="#/accounts">All accounts</Link>
        <Link href={`#/accounts/${account?.id ?? ""}/investments`}>Holdings overview</Link>
        <Button
          variant="secondary"
          disabled={busy}
          aria-pressed={model.tab === "holdings"}
          onClick={() => model.setTab("holdings")}
        >
          Holdings
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          aria-pressed={model.tab === "activity"}
          onClick={() => model.setTab("activity")}
        >
          Investment activity
        </Button>
        <Link href={`#/accounts/${account?.id ?? ""}`}>Cash activity</Link>
        <Button variant="secondary" disabled={busy} onClick={() => void model.load()}>
          Refresh investments
        </Button>
      </nav>
      {loading && <LoadingIndicator>Loading investments…</LoadingIndicator>}
      {model.error && (
        <p role="alert" className="error">
          {model.error}
        </p>
      )}
      {model.notice && <p role="status">{model.notice}</p>}
      {data && (
        <>
          <p>
            <strong>
              {data.cashCurrency} {data.cashBalance} uninvested cash
            </strong>{" "}
            · As of {data.asOf}
          </p>
          <p className="notice">
            Use the holdings overview for current market values. Record new fees and taxes
            separately as ordinary spending transactions; do not include those amounts again in a
            trade.
          </p>
          {!data.active && (
            <p>
              Archived investment account. Holdings remain readable; restore the account before
              making changes.
            </p>
          )}
          <div className="form-actions">
            <Button
              disabled={busy || !data.active || !!form}
              onClick={() => model.start("OPENING")}
            >
              Add existing holding
            </Button>
            <Button disabled={busy || !data.active || !!form} onClick={() => model.start("BUY")}>
              Record purchase
            </Button>
            <Button disabled={busy || !data.active || !!form} onClick={() => model.start("SELL")}>
              Record sale
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !data.active || !!securityForm}
              onClick={model.newSecurity}
            >
              Create security
            </Button>
          </div>
          {securityForm && (
            <section className="panel">
              <h2>Create security</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void model.createSecurity();
                }}
              >
                <fieldset disabled={busy} className="form-grid">
                  <Field htmlFor="security-name" label="Security name">
                    <Input
                      id="security-name"
                      required
                      maxLength={100}
                      value={securityForm.name}
                      onChange={(e) =>
                        model.setSecurityForm({ ...securityForm, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field htmlFor="security-symbol" label="Ticker / symbol">
                    <Input
                      id="security-symbol"
                      required
                      maxLength={32}
                      value={securityForm.symbol}
                      onChange={(e) =>
                        model.setSecurityForm({ ...securityForm, symbol: e.target.value })
                      }
                    />
                  </Field>
                  <Field htmlFor="security-exchange" label="Exchange">
                    <Input
                      id="security-exchange"
                      required
                      maxLength={64}
                      value={securityForm.exchange}
                      onChange={(e) =>
                        model.setSecurityForm({ ...securityForm, exchange: e.target.value })
                      }
                    />
                  </Field>
                  <Field htmlFor="security-type" label="Security type">
                    <Select
                      id="security-type"
                      value={securityForm.type}
                      onChange={(e) =>
                        model.setSecurityForm({
                          ...securityForm,
                          type: e.target.value as "STOCK" | "ETF",
                        })
                      }
                    >
                      <option value="STOCK">Stock</option>
                      <option value="ETF">ETF</option>
                    </Select>
                  </Field>
                  <Field htmlFor="security-currency" label="Trading currency">
                    <Input
                      id="security-currency"
                      required
                      maxLength={3}
                      pattern="[A-Z]{3}"
                      value={securityForm.currency}
                      onChange={(e) =>
                        model.setSecurityForm({
                          ...securityForm,
                          currency: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </Field>
                  <Field htmlFor="security-isin" label="ISIN (optional)">
                    <Input
                      id="security-isin"
                      maxLength={12}
                      value={securityForm.isin ?? ""}
                      onChange={(e) =>
                        model.setSecurityForm({
                          ...securityForm,
                          isin: e.target.value.toUpperCase() || null,
                        })
                      }
                    />
                  </Field>
                  <div className="form-actions">
                    <Button type="submit">Save security</Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => model.setSecurityForm(undefined)}
                    >
                      Cancel security
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          )}
          {form && (
            <section className="panel">
              <h2>
                {form.kind === "OPENING"
                  ? "Add existing holding"
                  : form.kind === "BUY"
                    ? "Record purchase"
                    : "Record sale"}
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void model.review();
                }}
              >
                <fieldset disabled={busy} className="form-grid">
                  <Field htmlFor="investment-security" label="Security">
                    <Select
                      id="investment-security"
                      required
                      value={form.securityId}
                      onChange={(e) =>
                        model.change({ securityId: e.target.value, allocations: null })
                      }
                    >
                      <option value="">Choose security</option>
                      {data.securities.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.symbol} · {s.exchange} · {s.currency}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {!data.securities.length && <p>Create a security above to continue.</p>}
                  <Field htmlFor="investment-quantity" label="Quantity">
                    <Input
                      id="investment-quantity"
                      required
                      inputMode="decimal"
                      value={form.quantity}
                      onChange={(e) =>
                        model.change({ quantity: e.target.value, allocations: null })
                      }
                    />
                  </Field>
                  <Field
                    htmlFor="investment-date"
                    label={form.kind === "OPENING" ? "Holdings snapshot date" : "Trade date"}
                  >
                    <Input
                      id="investment-date"
                      type="date"
                      required
                      value={form.tradeDate}
                      onChange={(e) =>
                        model.change({ tradeDate: e.target.value, allocations: null })
                      }
                    />
                  </Field>
                  <Field
                    htmlFor="investment-price"
                    label={`${form.kind === "OPENING" ? "Original unit price (optional)" : "Execution unit price"} (${security?.currency ?? "trading currency"})`}
                  >
                    <Input
                      id="investment-price"
                      required={form.kind !== "OPENING"}
                      inputMode="decimal"
                      value={form.unitPrice ?? ""}
                      onChange={(e) => model.change({ unitPrice: e.target.value || null })}
                    />
                  </Field>
                  {form.kind === "OPENING" ? (
                    <>
                      <Field
                        htmlFor="investment-acquired"
                        label="Original acquisition date (optional)"
                      >
                        <Input
                          id="investment-acquired"
                          type="date"
                          value={form.acquiredOn ?? ""}
                          onChange={(e) => model.change({ acquiredOn: e.target.value || null })}
                        />
                      </Field>
                      <Field
                        htmlFor="investment-cost"
                        label={`Total acquisition cost (${data.cashCurrency}, optional)`}
                      >
                        <Input
                          id="investment-cost"
                          inputMode="decimal"
                          value={form.acquisitionCost ?? ""}
                          onChange={(e) =>
                            model.change({ acquisitionCost: e.target.value || null })
                          }
                        />
                      </Field>
                      <label>
                        <Checkbox
                          checked={form.aggregateOpening}
                          onChange={(e) => model.change({ aggregateOpening: e.target.checked })}
                        />
                        Aggregate opening holding (original acquisition lots incomplete)
                      </label>
                      <p>
                        Opening holdings create shares without moving cash. Leave unavailable dates
                        or costs blank; they remain unknown.
                      </p>
                    </>
                  ) : (
                    <>
                      <Field
                        htmlFor="investment-settlement"
                        label={`Actual cash ${form.kind === "BUY" ? "debit" : "credit"} (${data.cashCurrency}, excluding separately recorded costs)`}
                      >
                        <Input
                          id="investment-settlement"
                          required
                          inputMode="decimal"
                          value={form.settlement ?? ""}
                          onChange={(e) => model.change({ settlement: e.target.value })}
                        />
                      </Field>
                      <Field htmlFor="investment-cash-date" label="Cash booking / settlement date">
                        <Input
                          id="investment-cash-date"
                          required
                          type="date"
                          value={form.cashDate ?? ""}
                          onChange={(e) => model.change({ cashDate: e.target.value })}
                        />
                      </Field>
                      <p>
                        Enter the amount actually booked by your broker. Execution price stays in{" "}
                        {security?.currency ?? "the security currency"}; cash stays in{" "}
                        {data.cashCurrency}. No exchange rate is guessed.
                      </p>
                    </>
                  )}
                  <Field htmlFor="investment-reference" label="Broker reference (optional)">
                    <Input
                      id="investment-reference"
                      maxLength={200}
                      value={form.reference}
                      onChange={(e) => model.change({ reference: e.target.value })}
                    />
                  </Field>
                  <Field htmlFor="investment-notes" label="Investment notes (optional)">
                    <Textarea
                      id="investment-notes"
                      maxLength={2000}
                      value={form.notes}
                      onChange={(e) => model.change({ notes: e.target.value })}
                    />
                  </Field>
                  <p>
                    Enter fees and taxes separately as spending transactions. The trade cash amount
                    must exclude those separately recorded costs.
                  </p>
                  {!!form.charges.length && (
                    <p>
                      Legacy charge components are retained for this correction. Do not record the
                      same included charges again as spending.
                    </p>
                  )}
                  <label>
                    <Checkbox
                      required
                      checked={form.cashOnlyConfirmed}
                      onChange={(e) => model.change({ cashOnlyConfirmed: e.target.checked })}
                    />
                    I confirmed this account balance is uninvested cash only and the entered cash
                    movement will not be entered again as spending. Fees are recorded separately.
                  </label>
                  <div className="form-actions">
                    <Button type="submit">
                      {preview ? "Rebuild investment preview" : "Preview investment activity"}
                    </Button>
                    <Button type="button" variant="secondary" onClick={model.cancel}>
                      Cancel investment entry
                    </Button>
                  </div>
                </fieldset>
              </form>
              {preview && (
                <section aria-label="Investment preview">
                  <h3>Investment preview</h3>
                  {model.dirty && (
                    <p role="status">Choices changed. Rebuild the preview before confirming.</p>
                  )}
                  <p>
                    Execution gross:{" "}
                    {preview.gross === null
                      ? "Unknown"
                      : `${preview.tradeCurrency} ${preview.gross}`}{" "}
                    · Cash movement: {preview.cashCurrency} {preview.cashMovement}
                  </p>
                  {!!preview.errors.length && (
                    <ul role="alert">
                      {preview.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <ul>
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  {form.kind === "SELL" && (
                    <>
                      <p>
                        Review lot allocations. FIFO is the default proposal; unknown acquisition
                        dates require your explicit review. Later sales may reserve shares.
                      </p>
                      <div className="import-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Opening / purchase date</th>
                              <th>Original acquisition date</th>
                              <th>Available shares</th>
                              <th>Shares to sell</th>
                              <th>Proposed allocated cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.availableLots.map((lot) => {
                              const allocation = preview.allocations.find(
                                (a) => a.lotId === lot.id,
                              );
                              return (
                                <tr key={lot.id}>
                                  <td>{lot.date}</td>
                                  <td>{lot.acquiredOn ?? "Unknown"}</td>
                                  <td>{lot.remaining}</td>
                                  <td>
                                    <Input
                                      disabled={busy}
                                      aria-label={`Sell quantity from lot ${lot.id}`}
                                      inputMode="decimal"
                                      value={
                                        form.allocations?.find((a) => a.lotId === lot.id)
                                          ?.quantity ??
                                        allocation?.quantity ??
                                        "0"
                                      }
                                      onChange={(e) =>
                                        model.change({
                                          allocations: preview.availableLots.map((l) => ({
                                            lotId: l.id,
                                            quantity:
                                              l.id === lot.id
                                                ? e.target.value
                                                : (form.allocations?.find((a) => a.lotId === l.id)
                                                    ?.quantity ??
                                                  preview.allocations.find((a) => a.lotId === l.id)
                                                    ?.quantity ??
                                                  "0"),
                                          })),
                                        })
                                      }
                                    />
                                  </td>
                                  <td>
                                    {allocation?.cashCost === null
                                      ? "Unknown"
                                      : allocation
                                        ? `${preview.cashCurrency} ${allocation.cashCost}`
                                        : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  <Button
                    disabled={busy || model.dirty || !!preview.errors.length}
                    onClick={() => void model.commit()}
                  >
                    Confirm{" "}
                    {form.kind === "OPENING"
                      ? "existing holding"
                      : form.kind === "BUY"
                        ? "purchase"
                        : "sale"}
                  </Button>
                </section>
              )}
            </section>
          )}
          {model.reversing && (
            <section className="panel" aria-label="Review investment reversal">
              <h2>
                Reverse {model.reversing.kind.toLowerCase()} of {name(model.reversing.securityId)}
              </h2>
              <p>
                Original quantity: {model.reversing.quantity}. Reversal preserves audit history.
                Correcting creates a separate replacement after reversal.
              </p>
              {model.reversal && (
                <>
                  <p>
                    Cash adjustment at original booking date: {model.reversing.cashCurrency}{" "}
                    {model.reversal.cashMovement}
                  </p>
                  <ul role={model.reversal.errors.length ? "alert" : undefined}>
                    {model.reversal.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  <div className="form-actions">
                    <Button
                      disabled={busy || !!model.reversal.errors.length}
                      onClick={() => void model.reverse(false)}
                    >
                      Confirm reversal
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || !!model.reversal.errors.length}
                      onClick={() => void model.reverse(true)}
                    >
                      Reverse and enter correction
                    </Button>
                  </div>
                </>
              )}
              <Button variant="secondary" disabled={busy} onClick={model.cancelReverse}>
                Cancel reversal
              </Button>
            </section>
          )}
          {model.tab === "holdings" ? (
            <section className="panel">
              <h2>Holdings</h2>
              {!data.holdings.length ? (
                <p>
                  No holdings effective as of {data.asOf}. Add existing holdings or record a
                  purchase. Future-dated activity appears in Investment activity.
                </p>
              ) : (
                <div className="import-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Security</th>
                        <th>Quantity</th>
                        <th>Known acquisition cost</th>
                        <th>Average acquisition cost</th>
                        <th>Lots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.holdings.map((holding) => (
                        <tr key={holding.security.id}>
                          <th scope="row">
                            {holding.security.name}
                            <small className="activity-meta">
                              {holding.security.symbol} · {holding.security.exchange} ·{" "}
                              {holding.security.currency}
                            </small>
                          </th>
                          <td>{holding.quantity}</td>
                          <td>
                            {data.cashCurrency} {holding.knownCost}
                            {!holding.costComplete && " (incomplete; some costs unknown)"}
                          </td>
                          <td>
                            {holding.averageCost === null
                              ? "Unknown"
                              : `${data.cashCurrency} ${holding.averageCost}`}
                          </td>
                          <td>
                            <details>
                              <summary>Review {holding.lots.length} lots</summary>
                              {holding.lots.map((lot) => (
                                <p key={lot.id}>
                                  {lot.date} · {lot.remaining} remaining of {lot.quantity} · Cost:{" "}
                                  {lot.remainingCost === null
                                    ? "Unknown"
                                    : `${data.cashCurrency} ${lot.remainingCost}`}{" "}
                                  · Acquired: {lot.acquiredOn ?? "Unknown"}
                                  {lot.aggregateOpening && " · Aggregate opening"}
                                </p>
                              ))}
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className="panel">
              <h2>Investment activity</h2>
              {!data.activities.length ? (
                <p>No investment activity recorded.</p>
              ) : (
                <>
                  <div className="import-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Security / kind</th>
                          <th>Quantity / execution</th>
                          <th>Cash / acquisition cost</th>
                          <th>Details</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.activities
                          .slice(model.activityPage * 25, model.activityPage * 25 + 25)
                          .map((activity) => (
                            <tr key={activity.id}>
                              <td>
                                {activity.tradeDate}
                                {activity.tradeDate > data.asOf && " · Scheduled"}
                              </td>
                              <th scope="row">
                                {name(activity.securityId)} · {activity.kind}
                                {activity.reversed && " · Reversed"}
                              </th>
                              <td>
                                {activity.quantity} @{" "}
                                {activity.unitPrice === null
                                  ? "Unknown"
                                  : `${activity.tradeCurrency} ${activity.unitPrice}`}
                                <br />
                                Gross: {activity.gross ?? "Unknown"} {activity.tradeCurrency}
                              </td>
                              <td>
                                {activity.kind === "OPENING"
                                  ? `Acquisition cost: ${activity.acquisitionCost ?? "Unknown"}`
                                  : activity.settlement}{" "}
                                {activity.cashCurrency}
                                {activity.cashDate && (
                                  <small className="activity-meta">
                                    Booked {activity.cashDate}
                                  </small>
                                )}
                              </td>
                              <td>
                                <details>
                                  <summary>Activity details</summary>
                                  <p>{activity.reference || "No broker reference"}</p>
                                  <p>{activity.notes}</p>
                                  {activity.charges.map((c, i) => (
                                    <p key={i}>
                                      {c.type}: {c.currency} {c.amount} (included)
                                    </p>
                                  ))}
                                  {activity.allocations?.map((a) => (
                                    <p key={a.lotId}>
                                      Lot {a.lotId}: {a.quantity} shares · Cost{" "}
                                      {a.cashCost ?? "Unknown"} {activity.cashCurrency}
                                    </p>
                                  ))}
                                </details>
                              </td>
                              <td>
                                <Button
                                  variant="secondary"
                                  disabled={busy || !data.active || activity.reversed || !!form}
                                  onClick={() => void model.reviewReverse(activity)}
                                >
                                  Review reversal / correction
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-actions">
                    <Button
                      variant="secondary"
                      disabled={busy || !model.activityPage}
                      onClick={() => model.setActivityPage(model.activityPage - 1)}
                    >
                      Previous investment activity
                    </Button>
                    <span>
                      Page {model.activityPage + 1} of {Math.ceil(data.activities.length / 25)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy || (model.activityPage + 1) * 25 >= data.activities.length}
                      onClick={() => model.setActivityPage(model.activityPage + 1)}
                    >
                      Next investment activity
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
