import { ManualNavPanel } from "./ManualNavPanel";
import { Button, Input, Link, LoadingIndicator, Select } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { displayAmount } from "../../../utils/accountPresentation";
import type { PortfolioViewModel } from "../../../types/viewModels";
import type { PricePoint } from "../../../types/marketdata";
function Trend({
  points,
  name,
  manual = false,
}: {
  points: PricePoint[];
  name: string;
  manual?: boolean;
}) {
  if (points.length < 2) return <span>No history</span>;
  // Floating point is used only for SVG coordinates; all financial values come from the backend.
  const values = points.map((p) => Number(p.close));
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = max - min || 1;
  const path = values
    .map((v, i) => `${(i * 120) / (values.length - 1)},${35 - ((v - min) * 30) / span}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 120 40"
      width="120"
      height="40"
      role="img"
      aria-label={`${name}: ${manual ? "manual NAV history (latest 30 valuation dates)" : "daily price trend over the last month"}`}
    >
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
export function PortfolioView(m: PortfolioViewModel) {
  const { account, data, pending, loading } = m;
  const value = account?.valuation;
  const busy = pending || loading;
  return (
    <>
      <WorkspaceHeading title={account?.name ?? "Investment holdings"} subtitle="Holdings" />
      {account && (
        <nav className="form-actions" aria-label="Investment account views">
          <Link href="#/accounts">All accounts</Link>
          <Link href={`#/accounts/${account?.id ?? ""}`}>Cash activity / record costs</Link>
          <Link href={`#/accounts/${account?.id ?? ""}/investments?activity=`}>
            Manage investment activity
          </Link>
        </nav>
      )}
      {m.error && (
        <p role="alert" className="error">
          {m.error}
        </p>
      )}
      {m.notice && <p role="status">{m.notice}</p>}
      {loading && <LoadingIndicator>Loading holdings…</LoadingIndicator>}
      {account && data && (
        <>
          <section className="panel" aria-label="Investment account value">
            <h2>
              {value?.unvaluedHoldings ? "Known account value (incomplete)" : "Account value"}
            </h2>
            <p className="net-worth-total">
              {account.currency} {displayAmount(value?.totalValue ?? data.cashBalance)}
            </p>
            <p>
              Holdings: {account.currency} {displayAmount(value?.holdingsValue ?? "0")} · Cash:{" "}
              {account.currency} {displayAmount(data.cashBalance)}
            </p>
            {!!value?.unvaluedHoldings && (
              <p className="notice">
                {value.unvaluedHoldings} holdings need a price or FX rate and are excluded from this
                total.
              </p>
            )}
            {value?.stale && (
              <p className="notice">
                Using older prices or NAVs. Refresh online quotes or enter the latest published fund
                NAV.
              </p>
            )}
            <p className="help">
              Account opening balance is uninvested cash only. Holding values are added separately.
              Record fees and taxes manually as spending; purchases and sales are investment
              activity.
            </p>
          </section>
          {!data.active && (
            <p className="notice">
              Archived account. Holdings remain readable; restore it to make changes.
            </p>
          )}
          <div className="form-actions">
            <Button disabled={busy || !data.active || m.adding} onClick={m.begin}>
              Add holding
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !data.active || m.adding}
              onClick={m.beginFund}
            >
              Add fund by ISIN
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !data.active}
              onClick={() => void m.refresh()}
            >
              Refresh prices
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void m.load()}>
              Reload holdings
            </Button>
          </div>
          {(m.adding || m.linking) && (
            <section className="panel">
              <h2>{m.linking ? "Choose online listing" : "Add existing holding"}</h2>
              <p>
                {m.linking
                  ? "Select the matching stock and exchange. Type and currency must match the existing security."
                  : "Record shares or fund units you already own. This adds to the existing position and does not move cash."}
              </p>
              {m.fundForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void m.createFund();
                  }}
                >
                  <fieldset disabled={busy} className="form-grid">
                    <Field htmlFor="fund-name" label="Fund name">
                      <Input
                        id="fund-name"
                        required
                        maxLength={100}
                        value={m.fundForm.name}
                        onChange={(e) => m.setFundForm({ ...m.fundForm!, name: e.target.value })}
                      />
                    </Field>
                    <Field htmlFor="fund-isin" label="Fund ISIN">
                      <Input
                        id="fund-isin"
                        required
                        minLength={12}
                        maxLength={12}
                        pattern="[A-Z]{2}[A-Z0-9]{9}[0-9]"
                        value={m.fundForm.isin}
                        onChange={(e) =>
                          m.setFundForm({ ...m.fundForm!, isin: e.target.value.toUpperCase() })
                        }
                      />
                    </Field>
                    <Field htmlFor="fund-currency" label="Fund currency">
                      <Input
                        id="fund-currency"
                        required
                        maxLength={3}
                        pattern="[A-Z]{3}"
                        value={m.fundForm.currency}
                        onChange={(e) =>
                          m.setFundForm({ ...m.fundForm!, currency: e.target.value.toUpperCase() })
                        }
                      />
                    </Field>
                    <p>
                      Use the share class ISIN and its NAV currency. Fund prices are entered
                      manually; no online lookup is required.
                    </p>
                    <Button type="submit">Create fund</Button>
                  </fieldset>
                </form>
              )}
              {!m.fundForm &&
                data.securities.find((s) => s.id === m.securityId)?.type !== "FUND" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void m.search();
                    }}
                  >
                    <Field htmlFor="stock-query" label="Find stock or ETF">
                      <Input
                        id="stock-query"
                        required
                        minLength={2}
                        maxLength={100}
                        value={m.query}
                        onChange={(e) => m.setQuery(e.target.value)}
                        disabled={busy}
                      />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      Search online
                    </Button>
                  </form>
                )}
              {m.results && (
                <ul>
                  {!m.results.length && (
                    <li>No matching stocks or ETFs. Try a ticker or another name.</li>
                  )}
                  {m.results.map((r) => (
                    <li key={`${r.symbol}-${r.exchange}`}>
                      <Button variant="secondary" disabled={busy} onClick={() => void m.select(r)}>
                        {r.name} · {r.symbol} · {r.exchange} · {r.type}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {m.adding && !m.fundForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void m.save();
                  }}
                >
                  <fieldset disabled={busy} className="form-grid">
                    <Field htmlFor="holding-security" label="Selected stock, ETF or fund">
                      <Select
                        id="holding-security"
                        required
                        value={m.securityId}
                        onChange={(e) => m.setSecurityId(e.target.value)}
                      >
                        <option value="">Search online or choose an existing security</option>
                        {data.securities.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.symbol} · {s.exchange} · {s.currency}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      htmlFor="holding-quantity"
                      label={
                        data.securities.find((s) => s.id === m.securityId)?.type === "FUND"
                          ? "Units to add"
                          : "Shares to add"
                      }
                    >
                      <Input
                        id="holding-quantity"
                        required
                        inputMode="decimal"
                        pattern="[0-9]{1,16}(\.[0-9]{1,12})?"
                        value={m.quantity}
                        onChange={(e) => m.setQuantity(e.target.value)}
                      />
                    </Field>
                    <Field htmlFor="holding-date" label="Held as of">
                      <Input
                        id="holding-date"
                        type="date"
                        required
                        value={m.date}
                        onChange={(e) => m.setDate(e.target.value)}
                      />
                    </Field>
                    <p>
                      Acquisition history is unknown for this entry. Cash stays unchanged; use
                      Manage investment activity for purchases, sales or corrections.
                    </p>
                    <Button type="submit">Save holding</Button>
                  </fieldset>
                </form>
              )}
              <Button variant="secondary" disabled={busy} onClick={m.cancel}>
                Cancel
              </Button>
            </section>
          )}
          <ManualNavPanel model={m} />
          <section className="panel">
            <h2>Holdings</h2>
            {!data.holdings.length ? (
              <p>No holdings yet. Add the stocks, ETFs or funds you own.</p>
            ) : (
              <div className="import-table">
                <table>
                  <thead>
                    <tr>
                      <th>Stock / ETF / Fund</th>
                      <th>Shares / units</th>
                      <th>Latest price / NAV</th>
                      <th>Price change / history</th>
                      <th>Market value</th>
                      <th>Quote details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.holdings.map((h) => {
                      const q = value?.holdings.find((q) => q.securityId === h.security.id);
                      const fund = h.security.type === "FUND";
                      return (
                        <tr key={h.security.id}>
                          <th scope="row">
                            {h.security.name}
                            <small className="activity-meta">
                              {fund
                                ? `${h.security.isin} · Fund`
                                : `${q?.symbol ?? h.security.symbol} · ${h.security.exchange}`}
                            </small>
                          </th>
                          <td>{h.quantity}</td>
                          <td>
                            {q?.price
                              ? `${q.currency} ${fund ? q.price : displayAmount(q.price)}`
                              : fund
                                ? "No NAV"
                                : "No price"}
                            <small className="activity-meta">
                              {fund ? "Previous NAV:" : "Previous close:"}{" "}
                              {q?.previousClose
                                ? `${q.currency} ${fund ? q.previousClose : displayAmount(q.previousClose)}`
                                : "Unavailable"}
                            </small>
                          </td>
                          <td>
                            {q?.changePercent !== null && q?.changePercent !== undefined
                              ? `${displayAmount(q.changePercent)}%`
                              : "—"}
                            <br />
                            {fund && <small className="activity-meta">Since previous NAV</small>}
                            <Trend
                              name={h.security.name}
                              manual={fund}
                              points={
                                fund
                                  ? (q?.navHistory ?? []).map((p) => ({ at: p.date, close: p.nav }))
                                  : (q?.series ?? [])
                              }
                            />
                          </td>
                          <td>
                            {q?.accountValue
                              ? `${account.currency} ${displayAmount(q.accountValue)}`
                              : "Not valued"}
                            {q?.nativeValue && q.currency !== account.currency && (
                              <small className="activity-meta">
                                {q.currency} {displayAmount(q.nativeValue)} · FX{" "}
                                {q.fxRate ?? "missing"}
                              </small>
                            )}
                          </td>
                          <td>
                            {fund && (
                              <small className="activity-meta">
                                Manual NAV{" "}
                                {q?.navDate && <time dateTime={q.navDate}>{q.navDate}</time>}
                                {q?.stale && " · Older NAV"}
                              </small>
                            )}
                            {fund && q?.reference && (
                              <small className="activity-meta">Source: {q.reference}</small>
                            )}
                            {q?.quotedAt && (
                              <small className="activity-meta">
                                Quoted {new Date(q.quotedAt).toLocaleString()}
                                {q.stale && " · Older quote"}
                              </small>
                            )}
                            {q?.fxQuotedAt && (
                              <small className="activity-meta">
                                FX {new Date(q.fxQuotedAt).toLocaleString()}
                              </small>
                            )}
                            {fund ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void m.openNav(h.security.id)}
                              >
                                {data.active ? "Update NAV / history" : "NAV history"}
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                disabled={busy || !data.active}
                                onClick={() => m.link(h.security.id)}
                              >
                                {q?.price ? "Change online listing" : "Link online listing"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="help">
            Prices and FX: Yahoo Finance, refreshed on request and reused for 15 minutes. Quotes may
            be delayed. Funds use dated manual NAVs; their trend uses the latest 30 recorded
            valuation dates. Trends show prices, not investment performance. Last successful quotes
            are kept if the source is unavailable.
          </p>
        </>
      )}
    </>
  );
}
