# Net-worth trends

Open **Trends** (`#/net-worth/trends`) or **View trends** from current net worth.
Select one account for its history, or several for a combined trend. Totals remain
separate by account currency. **Show account lines** overlays individual accounts;
the table always includes their values. Archived accounts are labelled and
selectable, but only active accounts are selected initially.

The default is twelve calendar months including the current month, with monthly
buckets. Choose start/end dates or the 1/3/6/12-month, year-to-date or all-history
presets. All history starts at the earliest selected opening date. Choose daily,
weekly (Monday–Sunday), monthly, quarterly or yearly buckets, then **Update trend**.
Each point is the balance at the bucket's closing date; the first and last buckets
are clipped to the inclusive range and labelled partial when necessary. The end
cannot exceed the business date. Applied account/date/bucket filters are stored in
the URL; reload and back/forward navigation restore them. Clear the accounts and
update to remove the chart. Failed updates explicitly mark retained results out
of date. Chart points support keyboard focus and exact-value tooltips; a scrollable
HTML table provides the same values and expandable price/FX provenance.

## Reconstructed history

This is a reconstruction using today's corrected records, not immutable snapshots
of what was reported at the time. Edits, deletions, reversals, corrected opening
dates, NAV corrections and listing changes can change earlier points. Current
account names and currencies are used. Selected archived accounts contribute
across their recorded history; historical archive-state changes are not replayed.
Permanently deleted unused accounts are unavailable.

Cash is opening balance plus nondeleted ledger movements through the closing date,
including movements before account opening. The opening amount is counted once.
Accounts do not contribute before their opening date; their individual values
show Not yet open. A currency with no opened selected accounts has no total.
Transfers between selected same-currency accounts conserve their combined value.
A transfer to an unselected account changes the selected total normally.

Investment quantities derive from effective, nonreversed activity by trade date;
linked cash uses its separate booking date. Prices come only from saved quotes,
their timestamped daily series, and manual NAVs. Stock/ETF history uses the currently
selected listing. A daily observation saved by a later refresh can fill an earlier
date, but a price dated after a point never values that point. The latest NAV date
on or before the point is used, with the newest correction for that date. Explicit
saved historical FX converts holdings into account currency; account currencies
are never combined through FX. Each holding value is rounded HALF_UP to eight
decimals before summing. All backend money calculations use BigDecimal.

The most recent applicable price/FX carries forward. Older means over seven days
since quote time or over one day since fetch time, evaluated at the historical
cutoff; fund NAVs use over seven calendar days since their valuation date. A later
fetch time does not make an earlier observation stale. Source dates, record times,
staleness and missing data are exposed per account. End-of-day cutoffs use
APP_BUSINESS_TIME_ZONE, including DST; today's cutoff is the calculation instant.
NAV/business dates are never converted through time zones.

Missing price or FX produces a gap in the account line and selected currency total.
The table labels the known subtotal and number of excluded positions explicitly as
incomplete. Acquisition cost and today's prices are never fallback valuations.
Historical stock/FX coverage is limited to saved observations; fund coverage depends
on entered NAVs. This feature does not download historical data, schedule refreshes,
calculate investment returns or persist snapshots.

## API and operation

- `GET /api/v1/net-worth/trend/options` returns owner-scoped account metadata
  (including archived accounts) and the server business date, without valuation.
- `GET /api/v1/net-worth/trend?accountIds=<uuid>&accountIds=<uuid>&startDate=2024-01-01&endDate=2024-12-31&bucket=MONTH`
  returns applied range/bucket, selected accounts, period boundaries, account
  values, currency totals, provenance and calculation timestamps.
- Buckets: DAY, WEEK, MONTH, QUARTER, YEAR. At least one owned account is required;
  any unavailable account rejects the entire request with 404. Invalid parameters
  or dates produce 400. Maximum 2,000 periods and 100,000 account-period pairs;
  choose coarser buckets or a shorter range if rejected. Money is decimal strings;
  complete `value` is null when incomplete or not yet open. `knownSubtotal` is also
  null before opening; missing/stale flags distinguish valuation gaps.

Reads require the existing authenticated/MFA-authorized session and never trust a
frontend owner ID. Responses use Cache-Control: no-store and one read-only
repeatable-read database snapshot. Relevant movements, holdings and saved quote
rows are loaded in batches; no provider calls, audit writes, new configuration,
dependencies, migrations or scheduled jobs are introduced. Deploy frontend and
backend together through the normal update procedure; existing full PostgreSQL
backups remain sufficient.
