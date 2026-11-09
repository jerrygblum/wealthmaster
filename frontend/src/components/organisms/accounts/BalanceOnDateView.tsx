import { Button, Checkbox, Input, Link, LoadingIndicator } from "../../atoms/Controls";
import { displayAmount } from "../../../utils/accountPresentation";
import type { AccountBalanceViewModel } from "../../../types/viewModels";
export function BalanceOnDateView(m: AccountBalanceViewModel) {
  const { account, report } = m;
  const stale =
    !!report &&
    (m.loading ||
      !!m.error ||
      report.date !== m.date ||
      !!report.forecast !== (m.includeExpected && m.date >= m.today && report.available) ||
      report.page !== m.page);
  const money = (value: string | null) =>
    value === null ? "Unavailable" : `${account.currency} ${displayAmount(value)}`;
  return (
    <section className="panel balance-date-panel" aria-label="Balance on date">
      <div className="balance-date-heading">
        <h2>Balance on date</h2>
        <span className="help">Closing {account.type === "INVESTMENT" ? "cash " : ""}balance</span>
      </div>
      <div className="balance-date-controls">
        <label>
          Balance date
          <Input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            required
            value={m.date}
            onChange={(e) => m.chooseDate(e.target.value)}
          />
        </label>
        <div className="balance-date-shortcuts" aria-label="Balance date shortcuts">
          {[
            [0, "Today"],
            [1, "Tomorrow"],
            [7, "+7 days"],
            [30, "+30 days"],
          ].map(([days, label]) => (
            <Button
              key={days}
              type="button"
              variant="secondary"
              onClick={() => m.shortcut(Number(days))}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <label className="balance-date-toggle">
        <Checkbox
          role="switch"
          aria-checked={m.includeExpected}
          checked={m.includeExpected}
          disabled={m.date < m.today}
          onChange={(e) => m.chooseExpected(e.target.checked)}
        />
        Include expected transactions
      </label>
      {m.date < m.today && (
        <p className="help">Expected projections are available for today and future dates.</p>
      )}
      {account.type === "CREDIT_CARD" && (
        <p className="help">Signed amounts: negative is debt; positive is credit.</p>
      )}
      {account.type === "INVESTMENT" && (
        <p className="help">Cash only. Security market values are excluded.</p>
      )}
      {m.loading && <LoadingIndicator>Calculating balance…</LoadingIndicator>}
      {m.error && (
        <div role="alert" className="error">
          <p>{m.error}</p>
          <Button type="button" onClick={() => void m.load()}>
            Retry balance
          </Button>
        </div>
      )}
      {stale && (
        <p role="status" className="notice">
          Previous calculation shown; it is out of date for the current selection.
        </p>
      )}
      {report && (
        <>
          {!report.available ? (
            <p role="status">
              Balance unavailable before this account’s opening date, {report.openingDate}.
            </p>
          ) : (
            <>
              <p>
                <strong>
                  Recorded {account.type === "INVESTMENT" ? "cash " : ""}balance on {report.date}
                </strong>
                <span className="balance-date-amount">{money(report.recordedBalance)}</span>
              </p>
              {report.forecast && (
                <>
                  <p>
                    <strong>
                      Projected balance including expected transactions
                      {!report.forecast.complete ? " (incomplete)" : ""}
                    </strong>
                    <span className="balance-date-amount">{money(report.forecast.balance)}</span>
                    Expected adjustment: {money(report.forecast.adjustment)}
                  </p>
                  <p className="help">
                    Estimate only. Unmatched expectations may overlap recorded activity. Confirm
                    links on the <Link href="#/expected">Expected page</Link>.
                  </p>
                  {report.forecast.overdueCount > 0 && (
                    <p className="notice">
                      {report.forecast.overdueCount} overdue unrecorded expected items are reminders
                      only and are excluded.{" "}
                      <Link href="#/expected">Review expected transactions</Link>.
                    </p>
                  )}
                  {!!report.forecast.reviews.length && (
                    <div className="notice">
                      <p>Projection incomplete: expected items need review and are excluded.</p>
                      <ul>
                        {report.forecast.reviews.map((r) => (
                          <li key={`${r.expectationId}:${r.month}`}>
                            {r.name} · {r.month.slice(0, 7)}: {r.reason}
                          </li>
                        ))}
                      </ul>
                      <Link href="#/expected">Review on Expected</Link>
                    </div>
                  )}
                </>
              )}
              <details>
                <summary>Balance breakdown</summary>
                <dl className="balance-date-summary">
                  <dt>Current cash balance ({report.businessDate})</dt>
                  <dd>{money(report.currentBalance)}</dd>
                  <dt>Recorded change to {report.date}</dt>
                  <dd>{money(report.recordedChange)}</dd>
                  {report.forecast && (
                    <>
                      <dt>Expected adjustment</dt>
                      <dd>{money(report.forecast.adjustment)}</dd>
                    </>
                  )}
                </dl>
                <p className="help">
                  Recorded balances include opening cash plus all nondeleted movements through the
                  selected date, including entries before opening. Corrected history is
                  recalculated.
                </p>
                {report.date > report.businessDate ? (
                  <>
                    <h3>Contributions through {report.date}</h3>
                    {report.entries.length ? (
                      <div
                        className="balance-date-table"
                        role="region"
                        aria-label="Balance contributions"
                      >
                        <table>
                          <caption className="sr-only">
                            Scheduled and expected cash contributions
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Date</th>
                              <th scope="col">Description</th>
                              <th scope="col">Source</th>
                              <th scope="col">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.entries.map((e) => (
                              <tr key={`${e.source}:${e.id}`}>
                                <td>{e.date}</td>
                                <th scope="row">{e.description}</th>
                                <td>
                                  {e.source === "EXPECTED" ? (
                                    <Link href="#/expected">Expected (estimate)</Link>
                                  ) : (
                                    "Recorded (scheduled)"
                                  )}
                                </td>
                                <td>{money(e.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>No scheduled or expected contributions on this page.</p>
                    )}
                  </>
                ) : report.forecast && report.entries.length > 0 ? (
                  <ul>
                    {report.entries.map((e) => (
                      <li key={e.id}>
                        {e.date} · {e.description} · Expected (estimate) · {money(e.amount)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No later scheduled contributions are included.</p>
                )}
                {(report.page > 0 || report.hasMore) && (
                  <nav className="form-actions" aria-label="Balance breakdown pages">
                    <Button
                      variant="secondary"
                      disabled={m.loading || m.page === 0}
                      onClick={() => m.setPage(m.page - 1)}
                    >
                      Previous contributions
                    </Button>
                    <span>Page {m.page + 1}</span>
                    <Button
                      variant="secondary"
                      disabled={m.loading || !report.hasMore}
                      onClick={() => m.setPage(m.page + 1)}
                    >
                      Next contributions
                    </Button>
                  </nav>
                )}
              </details>
              <p className="help">
                Calculated {new Date(report.calculatedAt).toLocaleString()}. Compare with your bank;
                this view cannot detect entries you have never recorded.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
