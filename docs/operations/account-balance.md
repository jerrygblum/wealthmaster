# Balance on a chosen date

Open an account's **Cash activity / Account activity** page and use **Balance on
date**. It starts at the server's business date. Choose any valid date in years
1–9999, or use Today, Tomorrow, +7 days or +30 days. Controls refresh the calculation
automatically. The normal current balance and activity list remain unchanged.

**Recorded balance on [date]** is the closing cash balance: opening cash plus all
nondeleted ledger movements with transaction date on or before that date. This
includes scheduled income, expenses, refunds, transfers and linked investment cash.
Value dates do not change inclusion. Investment security market values are excluded.
Credit-card values remain signed: negative means debt, positive means credit.

Balances before the account's opening date are unavailable. On or after opening,
all qualifying movements, including those entered before opening, contribute; the
opening amount is counted once. Archived accounts remain readable. Historical
values are reconstructed from corrected records, not immutable snapshots.

## Expected projection

Switch **Include expected transactions** on for today or a future date to display a
separate **Projected balance including expected transactions** and its signed
expected adjustment. The recorded balance always remains visible. The switch is
disabled for past dates but retains its choice when returning to today/future.
Nothing is recorded or matched by looking at the forecast.

- Include unrecorded recurring occurrences due from today through the selected
  date, inclusive. Schedule start/end months and month-end due-day clamping apply.
- Expected income increases cash, expenses decrease it, and transfers subtract
  from the source account and add to the destination.
- Valid confirmed matches are represented solely by the actual ledger entry, using
  its actual date and amount. Never add an expected amount for a linked occurrence,
  even when the actual entry is before/after the projection window or differs in
  amount. Scheduled confirmed matches follow their actual cash date.
- Skipped occurrences and deleted definitions are excluded. Unavailable references,
  deleted/incompatible linked transactions and retained links outside an edited
  schedule are excluded and produce an explicitly incomplete forecast with review
  links to Expected.
- Overdue unrecorded occurrences are counted separately as reminders and do not
  affect the projection. Historical reminder counts are computed without expanding
  every past month. Suggested matches are never automatically confirmed: unmatched
  expectations may overlap recorded activity until the user confirms their links.

Expand **Balance breakdown** to inspect the current cash balance, recorded change
to the selected date and expected adjustment. For future dates it lists both
scheduled recorded cash and hypothetical expected contributions chronologically.
Today can show unrecorded expectations due today. Entries have signed amounts and
explicit source labels; opening cash and current cash are not added again as rows.
Past-date differences are numeric comparisons against today's cash, while the
normal activity list remains available for inspecting individual historical entries.

Breakdown pages contain up to 50 entries; totals always include all qualifying
activity. Selecting another date or switching projection resets breakdown pagination.
Saving/editing/deleting activity refreshes the calculation without resetting the
chosen date. Entering another account starts at today with expectations off. Failed
refreshes mark retained results as out of date; retry without losing the controls.

## API and operation

`GET /api/v1/accounts/{id}/balance?date=2026-11-16&includeExpected=false&page=0`
returns owned account metadata, date/business date/calculation timestamp, opening
cash, current cash, recorded balance, signed recorded difference, optional forecast,
review warnings, overdue reminder count and paginated contributions. Monetary values
are decimal strings. Before opening, `available` is false and recorded balance/change
are null. Forecast is null when disabled, before opening or for a past date.

Reads require the existing authenticated/MFA-authorized session; the public demo
explicitly allows this read capability. Unknown/unowned accounts return 404. Invalid
dates/pages return 400. Forecast generation is bounded to 2,000 forward candidate
occurrences (including retained links requiring review); longer ranges return 400
with guidance to shorten the range or disable projection. Recorded-only calculations
support the full valid date range. Overdue reminders do not consume that limit.

The response uses Cache-Control: no-store and one read-only repeatable-read snapshot
across account setup, ledger sums, recurrence definitions and confirmed links. Ledger
services own cash aggregation; budgets services own expected contributions; accounts
orchestrates the report. No market data calls, ledger mutations, occurrence writes,
audit writes, schema migrations, dependencies or configuration changes are added.
Deploy frontend/backend together through the normal update process. Existing full
PostgreSQL backups remain sufficient.

This is a manual checking tool. It does not reconcile a bank statement automatically
or discover transactions that have never been entered.
