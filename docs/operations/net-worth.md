# Current net worth

The default overview and `GET /api/v1/net-worth/current` calculate totals from opening balances plus non-deleted ledger movements. V019 adds saved market quotes; no new dependency, scheduled job or configuration is required. Normal authenticated sessions retain the existing MFA restrictions; ownership always comes from the session. Responses use `Cache-Control: no-store`.

Each currency has separate assets, liabilities and net worth. Positive account positions are assets; negative positions are liabilities. This covers overdrafts and credit-card overpayments without classifying by account type. Archived accounts are excluded from current totals, breakdowns and contributions (ADR 007); restoring them reinstates their balances. Ledger and spending history remain available. Investment accounts contribute uninvested cash plus priced holdings converted into account currency using saved FX quotes. Cash account currencies remain separate; historical valuation is not included. Accurate totals therefore depend on recording all relevant opening balances and activity.

Investment holdings are tracked separately from cash. `unvaluedHoldings` counts positive active account/security positions effective on the business date which lack a price or required FX quote. A positive count produces a prominent incomplete-valuation notice; acquisition cost never substitutes for market value. Investment purchases/sales change cash without becoming ordinary spending or income.

`APP_BUSINESS_TIME_ZONE` defaults to `Europe/Zurich` and is shared with ledger date validation. `balanceAsOf` is the business date; `calculatedAt` is a UTC instant. Date-only fields are never converted through time zones. Accounts opening after that business date appear under Future accounts and do not enter totals until their opening date.

Every report uses one repeatable-read PostgreSQL snapshot, so paired transfer sides cannot be observed from different commits. Refresh or re-enter the overview after changes. Failed refreshes mark any previous report explicitly; expired sessions return to sign-in. Reports do not write audit records. Amounts remain decimal strings, including aggregates larger than the transaction input limit.

Verification covers exact arithmetic, signed positions, refunds and deletions, transfer conservation, investment cash, archived/future accounts, ownership and MFA, and concurrent transfers. Browser journeys run under development and production profiles on desktop and mobile using synthetic disposable databases.
