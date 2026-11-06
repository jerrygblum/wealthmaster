import { Button, Checkbox, Input, Link, LoadingIndicator, Select } from "../../atoms/Controls";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { TrendChart } from "./TrendChart";
import { displayAmount } from "../../../utils/accountPresentation";
import type { TrendBucket, TrendModel, TrendTotal, TrendValue } from "../../../types/netWorthTrend";

function amount(value: TrendTotal | TrendValue | undefined) {
  if (!value || ("opened" in value && !value.opened)) return "Not yet open";
  if (value.value !== null)
    return `${displayAmount(value.value)}${value.stale ? " · Older data" : ""}`;
  if (value.knownSubtotal === null) return "No accounts open";
  return `Incomplete · known subtotal ${displayAmount(value.knownSubtotal)} · ${value.missingPositions} missing positions`;
}
export function NetWorthTrendView(m: TrendModel) {
  const { options, filters, report } = m;
  const dirty =
    !!report &&
    !!filters &&
    (report.startDate !== filters.startDate ||
      report.endDate !== filters.endDate ||
      report.bucket !== filters.bucket ||
      report.accounts
        .map((a) => a.id)
        .sort()
        .join() !== [...filters.accountIds].sort().join());
  const currencies = [...new Set(report?.accounts.map((a) => a.currency) ?? [])].sort();
  return (
    <>
      <WorkspaceHeading title="Net-worth trends" subtitle="Reconstructed history" />
      <p>
        <Link href="#/net-worth">Current net worth</Link>
      </p>
      <p className="help">
        History uses corrected records and prices applicable to each closing date. Corrections,
        reversals, opening-date changes and listing changes can alter past results. Archived
        accounts are included only when selected. Totals stay separate by currency.
      </p>
      {options && filters && (
        <form
          className="panel trend-filter-panel"
          aria-label="Trend filters"
          onSubmit={(e) => {
            e.preventDefault();
            void m.update();
          }}
        >
          <details
            className="trend-account-picker"
            open={options.accounts.length === 0 || undefined}
          >
            <summary>
              <span>
                Accounts{" "}
                <span className="trend-selection-count">{filters.accountIds.length} selected</span>
              </span>
              <span className="trend-selection-preview">
                {options.accounts
                  .filter((a) => filters.accountIds.includes(a.id))
                  .map((a) => a.name)
                  .join(", ") || "Choose accounts"}
              </span>
            </summary>
            <fieldset disabled={m.loading}>
              <legend className="sr-only">Accounts to include</legend>
              <div className="form-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    m.change({
                      accountIds: options.accounts.filter((a) => a.active).map((a) => a.id),
                    })
                  }
                >
                  Select all active
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => m.change({ accountIds: [] })}
                >
                  Clear
                </Button>
              </div>
              {!options.accounts.length && (
                <p>
                  No accounts yet. <Link href="#/accounts">Create an account</Link> to begin.
                </p>
              )}
              <div className="trend-account-list">
                {options.accounts.map((a) => (
                  <label key={a.id}>
                    <Checkbox
                      checked={filters.accountIds.includes(a.id)}
                      onChange={(e) =>
                        m.change({
                          accountIds: e.target.checked
                            ? [...filters.accountIds, a.id]
                            : filters.accountIds.filter((id) => id !== a.id),
                        })
                      }
                    />
                    {a.name} · {a.currency}
                    {!a.active ? " · Archived" : ""}
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
          <div className="trend-presets" aria-label="Date range presets">
            {[
              ["1", "1 month"],
              ["3", "3 months"],
              ["6", "6 months"],
              ["12", "12 months"],
              ["ytd", "Year to date"],
              ["all", "All history"],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="secondary"
                disabled={m.loading}
                onClick={() => m.preset(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="trend-filters">
            <label>
              Start date
              <Input
                type="date"
                required
                min="0001-01-01"
                max={options.businessDate}
                value={filters.startDate}
                disabled={m.loading}
                onChange={(e) => m.change({ startDate: e.target.value })}
              />
            </label>
            <label>
              End date
              <Input
                type="date"
                required
                min={filters.startDate || "0001-01-01"}
                max={options.businessDate}
                value={filters.endDate}
                disabled={m.loading}
                onChange={(e) => m.change({ endDate: e.target.value })}
              />
            </label>
            <label>
              Time buckets
              <Select
                value={filters.bucket}
                disabled={m.loading}
                onChange={(e) => m.change({ bucket: e.target.value as TrendBucket })}
              >
                {[
                  ["DAY", "Daily"],
                  ["WEEK", "Weekly"],
                  ["MONTH", "Monthly"],
                  ["QUARTER", "Quarterly"],
                  ["YEAR", "Yearly"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <Button className="trend-update" type="submit" disabled={m.loading}>
              Update trend
            </Button>
          </div>
          {!filters.accountIds.length && (
            <p role="status">Select at least one account, then update the trend.</p>
          )}
          {dirty && <p role="status">Filters changed. Update to apply them.</p>}
        </form>
      )}
      {m.loading && <LoadingIndicator>Calculating trend…</LoadingIndicator>}
      {m.error && (
        <div role="alert" className="error">
          <p>{m.error}</p>
          {report && <p>The retained chart is out of date. Retry to update it.</p>}
          <Button disabled={m.loading} onClick={m.retry}>
            Try again
          </Button>
        </div>
      )}
      {report && (
        <>
          <p>
            Applied range: {report.startDate} to {report.endDate} · {report.bucket.toLowerCase()}{" "}
            buckets · Business date {report.businessDate} · Calculated{" "}
            {new Date(report.calculatedAt).toLocaleString()}
          </p>
          <label className="trend-chart-toggle">
            <Checkbox
              checked={m.showAccounts}
              onChange={(e) => m.setShowAccounts(e.target.checked)}
            />
            Show account lines
          </label>
          <p className="help">
            Each point is a period-end balance; partial periods are labelled. Older prices are
            carried forward and flagged. Missing prices or FX break lines rather than showing a
            complete total.
          </p>
          {currencies.map((currency) => (
            <section className="panel" key={currency} aria-label={`${currency} net-worth trend`}>
              <h2>{currency} net-worth trend</h2>
              <TrendChart report={report} currency={currency} showAccounts={m.showAccounts} />
              <div
                className="trend-table-scroll"
                role="region"
                aria-label={`${currency} trend data`}
                // Keyboard focus allows horizontal scrolling of wide financial tables.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
              >
                <table>
                  <caption>{currency} closing values (account currency)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Period</th>
                      <th scope="col">Selected total</th>
                      {report.accounts
                        .filter((a) => a.currency === currency)
                        .map((a) => (
                          <th scope="col" key={a.id}>
                            {a.name}
                            {!a.active ? " (Archived)" : ""}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.points.map((point) => (
                      <tr key={point.period.endDate}>
                        <th scope="row">
                          {point.period.startDate} – {point.period.endDate}
                          {point.period.partial ? " (partial)" : ""}
                        </th>
                        <td>{amount(point.currencies.find((c) => c.currency === currency))}</td>
                        {report.accounts
                          .filter((a) => a.currency === currency)
                          .map((a) => {
                            const value = point.accounts.find((v) => v.accountId === a.id);
                            return (
                              <td key={a.id}>
                                {amount(value)}
                                {!!value?.sources.length && (
                                  <details>
                                    <summary>Price / FX sources</summary>
                                    <ul>
                                      {value.sources.map((source, i) => (
                                        <li key={i}>
                                          {source.securityName} · {source.currency} ·{" "}
                                          {source.missing
                                            ? "Missing price / FX"
                                            : `${source.source ?? "Saved quote"} · ${source.priceDate ?? ""}${source.stale ? " · Older data" : ""}`}
                                          {source.fetchedAt && <> · Recorded {source.fetchedAt}</>}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
