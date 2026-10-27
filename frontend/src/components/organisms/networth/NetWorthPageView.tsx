import type { NetWorthPageViewModel } from "../../../types/viewModels";
import { accountTypes, displayAmount } from "../../../utils/accountPresentation";
import { ActionIcon } from "../../atoms/ActionIcon";
import { Button, Link, LoadingIndicator } from "../../atoms/Controls";
import { WorkspaceHeading } from "../application/WorkspaceHeading";

export function NetWorthPageView({ report, loading, error, load, user }: NetWorthPageViewModel) {
  return (
    <>
      <WorkspaceHeading title={<>Net worth</>} subtitle={<>{user.email}</>} />
      <div className="section-heading">
        <p>What you own, less what you owe.</p>
        <Button
          variant="secondary"
          className="compact-action"
          aria-label="Refresh net worth"
          title="Refresh net worth"
          disabled={loading}
          onClick={() => void load()}
        >
          <ActionIcon action="refresh" />
        </Button>
      </div>
      <p className="help">
        Based on recorded balances of active accounts. Archived accounts are excluded. Investment
        accounts contribute cash plus priced holdings, converted into the account currency. Each
        account currency has its own total. Quote timestamps are available in the holdings view.
      </p>
      {!!report?.unvaluedHoldings && (
        <p role="status" className="notice">
          Total incomplete — {report.unvaluedHoldings} security positions need a price or FX rate
          and are excluded. Acquisition cost is not market value.
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          {report && (
            <p>The previous calculation is shown below. Refresh to get updated balances.</p>
          )}
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}
      {loading ? (
        <LoadingIndicator role="status">Calculating net worth…</LoadingIndicator>
      ) : (
        report && (
          <>
            <p className="muted">
              As of <time dateTime={report.balanceAsOf}>{report.balanceAsOf}</time> · Calculated{" "}
              <time dateTime={report.calculatedAt}>
                {new Date(report.calculatedAt).toLocaleString()}
              </time>
            </p>
            {report.currencies.length === 0 ? (
              <section className="panel empty-state">
                <h2>
                  {report.excludedFutureAccounts.length
                    ? "No accounts are open yet"
                    : "No active accounts yet"}
                </h2>
                <p>
                  {report.excludedFutureAccounts.length
                    ? "Future accounts will contribute once their opening date arrives."
                    : "Add or restore an active account to see what you own and owe."}
                </p>
                <Link href="#/accounts">Go to Accounts</Link>
              </section>
            ) : (
              <div className="account-grid">
                {report.currencies.map((total) => (
                  <section
                    className="panel net-worth-card"
                    key={total.currency}
                    aria-labelledby={`worth-${total.currency}`}
                  >
                    <h2 id={`worth-${total.currency}`}>{total.currency} net worth</h2>
                    <p className="net-worth-total">
                      {total.currency} {displayAmount(total.netWorth)}
                    </p>
                    <dl className="net-worth-totals">
                      <div>
                        <dt>Assets</dt>
                        <dd>
                          {total.currency} {displayAmount(total.assets)}
                        </dd>
                      </div>
                      <div>
                        <dt>Liabilities</dt>
                        <dd>
                          {total.currency} {displayAmount(total.liabilities)}
                        </dd>
                      </div>
                    </dl>
                    <details>
                      <summary>Breakdown by account type</summary>
                      <ul className="net-worth-types">
                        {total.byAccountType.map((type) => (
                          <li key={type.type}>
                            <strong>{accountTypes[type.type]}</strong>
                            <span>
                              Assets: {displayAmount(type.assets)} · Liabilities:{" "}
                              {displayAmount(type.liabilities)} · Net worth:{" "}
                              {displayAmount(type.netWorth)} {total.currency}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </section>
                ))}
              </div>
            )}
            {report.accounts.length > 0 && (
              <section className="net-worth-accounts" aria-labelledby="contributions-heading">
                <h2 id="contributions-heading">Account contributions</h2>
                <div className="account-grid">
                  {report.accounts.map((account) => (
                    <article className="panel" key={account.id}>
                      <p className="eyebrow">{accountTypes[account.type]}</p>
                      <h3>
                        <Link
                          href={`#/accounts/${account.id}${account.type === "INVESTMENT" ? "/investments" : ""}`}
                        >
                          {account.name}
                        </Link>
                      </h3>
                      {account.valuation?.stale && (
                        <p className="notice">Using older prices or NAVs.</p>
                      )}
                      <p>
                        {account.currency} {displayAmount(account.currentBalance)}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="help">
                  Negative contributions are amounts owed. Credit-card overpayments contribute to
                  assets.
                </p>
              </section>
            )}
            {report.excludedFutureAccounts.length > 0 && (
              <section className="net-worth-accounts" aria-labelledby="future-heading">
                <h2 id="future-heading">Future accounts</h2>
                <p>Excluded from current totals until their opening date.</p>
                <ul className="future-accounts">
                  {report.excludedFutureAccounts.map((account) => (
                    <li key={account.id}>
                      <Link
                        href={`#/accounts/${account.id}${account.type === "INVESTMENT" ? "/investments" : ""}`}
                      >
                        {account.name}
                      </Link>{" "}
                      · {accountTypes[account.type]} · {account.currency} · Opens{" "}
                      <time dateTime={account.openingDate}>{account.openingDate}</time>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )
      )}
    </>
  );
}
