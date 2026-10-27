import { Button, Input, LoadingIndicator } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import type { PortfolioViewModel } from "../../../types/viewModels";

export function ManualNavPanel({ model: m }: { model: PortfolioViewModel }) {
  const fund = m.data?.securities.find((s) => s.id === m.navSecurity);
  if (!fund || !m.navForm) return null;
  const form = m.navForm,
    busy = m.pending || m.loading || m.navHistoryLoading;
  return (
    <section className="panel" aria-label="Fund NAV entry and history">
      <h2>{fund.name}: manual NAV</h2>
      <p>
        {fund.isin} · {fund.currency}
      </p>
      <p>
        Enter the published net asset value per unit and its valuation date. This updates this fund
        in all your investment accounts; units and cash stay unchanged.
      </p>
      {m.data?.active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void m.saveNav();
          }}
        >
          <fieldset className="form-grid" disabled={busy}>
            <Field htmlFor="fund-nav" label={`Published NAV per unit (${fund.currency})`}>
              <Input
                id="fund-nav"
                required
                inputMode="decimal"
                pattern="[0-9]{1,26}(\.[0-9]{1,12})?"
                value={form.nav}
                onChange={(e) => m.setNavForm({ ...form, nav: e.target.value })}
              />
            </Field>
            <Field htmlFor="fund-nav-date" label="NAV valuation date">
              <Input
                id="fund-nav-date"
                type="date"
                required
                min="0001-01-01"
                max={m.data.asOf}
                value={form.date}
                onChange={(e) => m.setNavForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field htmlFor="fund-nav-reference" label="Source reference (optional)">
              <Input
                id="fund-nav-reference"
                maxLength={500}
                value={form.reference}
                onChange={(e) => m.setNavForm({ ...form, reference: e.target.value })}
              />
            </Field>
            <p>
              An entry on the same valuation date corrects that day's NAV. Earlier entries remain in
              the history. An older dated NAV adds history without replacing a newer valuation.
            </p>
            <Button type="submit">Save NAV</Button>
          </fieldset>
        </form>
      )}
      <h3>NAV history</h3>
      {m.navHistoryLoading ? (
        <LoadingIndicator>Loading NAV history…</LoadingIndicator>
      ) : !m.navEntries.length ? (
        <p>No NAV entries yet.</p>
      ) : (
        <div className="import-table">
          <table>
            <thead>
              <tr>
                <th>Valuation date</th>
                <th>NAV per unit</th>
                <th>Recorded</th>
                <th>Source reference</th>
              </tr>
            </thead>
            <tbody>
              {m.navEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <time dateTime={entry.date}>{entry.date}</time>
                  </td>
                  <td>
                    {entry.currency} {entry.nav}
                  </td>
                  <td>{new Date(entry.recordedAt).toLocaleString()}</td>
                  <td>{entry.reference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="help">
            Latest 100 entries, including corrections. For each date, the most recently recorded
            entry is used.
          </p>
        </div>
      )}
      <Button variant="secondary" disabled={m.pending} onClick={m.closeNav}>
        Close NAV history
      </Button>
    </section>
  );
}
