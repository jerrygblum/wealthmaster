# Product Requirements

## Vision

A self-hosted personal wealth application that replaces spreadsheet-based financial tracking and gives the user a trustworthy, explainable view of total net worth.

The product should answer four questions well:

1. What do I own and owe right now?
2. Where did my money go and what is still expected?
3. Am I staying within my budgets?
4. How is my wealth changing over time, including investments?

## Users

### Primary
The owner, migrating from an existing Excel-based finance workflow.

### Future
A small number of independent friends/family accounts. Each user's data is isolated. Shared household finances are not an initial requirement.

### Demo
A portfolio/demo account containing only synthetic data.

## Primary success criterion

The owner can stop using the existing Excel workbook for day-to-day personal finance tracking without losing required functionality or confidence in the numbers.

Before V1:
- historical Excel/CSV transactions can be imported;
- all relevant financial accounts can be represented;
- transfers are correct and do not distort spending;
- categories and budgets can be represented;
- expected recurring costs/income can be tracked;
- investment holdings can be represented;
- current and historical net worth can be calculated;
- financial data can be exported/backup-restored.

## Functional requirements

### Identity and security
- Account creation and login. Initially provision the owner through environment configuration; the registration page is deferred.
- Mandatory MFA for normal accounts in production. Enrollment is optional only in the explicit development profile; enabled MFA is enforced at every login in both modes.
- TOTP with single-use recovery codes, verified enrollment, authenticator replacement, and recovery-code regeneration through user security settings. No disable action.
- Secure recovery/reset workflow.
- User data isolation.
- Account/data deletion and export.

### Financial accounts
Supported types initially:
- Current/checking
- Savings
- Credit card
- Cash
- Investment/brokerage
- Other

Each account has owner, name, type, institution (optional), native currency, opening balance, opening date, and active/archive status. Investment opening balances represent uninvested cash only.

Accounts support editing, archive/restore, and confirmed permanent deletion when unused. Financial activity locks type, currency, opening amount, and opening date; name and institution remain editable. A nonzero opening balance alone does not block deletion. Archived accounts preserve financial history and valuation; future transaction/trade entry requires restoration. Changes retain audit snapshots, including after permanent deletion.

### Ledger transactions
- Create/edit/delete transactions with auditability.
- Income, expense, and expense refunds (refunds reduce spending).
- Date/value date where relevant.
- Amount/currency.
- Merchant/payee, description, notes.
- Category/subcategory.
- Tags later if useful.
- Split transactions supported by the model.
- Imported/source metadata preserved.

### Transfers
- Link source and destination account movements.
- Never treated as income/expense.
- Optional transfer fees.
- Cross-currency support later without changing the model.
- Editing/deleting preserves consistency of both sides.

### Credit cards
- Credit card is an account/liability.
- Purchases are expenses.
- Bill payment is a transfer from a bank account to the card account.
- Statement import avoids double counting.

### Categories and budgets

The implemented category slice supports user-owned income and spending categories with one subcategory level. Either level is optional on ordinary activity; refunds use spending categories and transfers have none. Users can start empty or explicitly install an editable starter set once. Category management supports rename, archive/restore, and deletion only when never used and without children. Historical use locks type and parent even after clearing or deleting activity. Archiving a parent hides the entire branch from new assignment without changing child active flags. Renames update current labels; audit snapshots preserve prior labels. Compact spending-category cards set one normal monthly or yearly limit per currency, or No limit. Spending shows monthly/yearly expense distribution, refunds, exact net spending and effective comparisons, even without limits. Period exceptions are edited next to comparisons. Rules and bulk assignment follow later.

- User-defined categories/subcategories.
- Normal limits apply from the current business month/year forward. Dated revisions preserve earlier periods; specific monthly/yearly exceptions take precedence and survive normal changes. Zero limits are distinct from No limit; no rollover or FX conversion.
- Parent limits include direct spending and immediate children; child limits may coexist and overlapping allowances are never summed.
- Actuals use transaction-date expenses minus refunds, including archived accounts/categories. Refunds may make net spending negative.
- Currency summaries include net, uncategorized and spending without an applicable budget, counting covered activity once.
- Explicit exceptions can be copied to a different period; existing targets and archived branches are skipped with reasons. Normal settings are never copied.
- Budget history permanently prevents category deletion and locks category type/parent even after limit deletion.
- Actual, remaining, percentage used, over-budget state.
- Optional rollover is a later capability.

### Expected/fixed transactions
Expected costs/income are separate from actual transactions.

Fields include name, expected account/category, expected amount or range, frequency, expected date/day, start/end date, and matching rules.

Period views show found/missing expected items and allow manual correction of matches.

### Imports

Imports and recurring expectations remain deferred while category limits and spending reports are available.
Supported sequence:
1. CSV
2. XLSX
3. PDF statements later
4. API integrations much later

Import flow:
`upload -> sheet/source selection -> column detection/mapping -> normalization -> validation -> duplicate detection -> categorization -> preview -> review -> commit`

Requirements:
- save reusable mapping profiles;
- preserve original rows/source values;
- show import batch status/results;
- allow rollback/undo where safe;
- do not silently discard uncertain data.

### Automatic categorization
Priority:
1. Explicit user rules
2. Historical merchant mapping
3. Automated classifier suggestion
4. Uncategorized

Suggestions are explainable and user-correctable. A user correction may offer to create/update a rule.

### Investments
Initial asset types: stocks and ETFs.

Investment activities:
- Buy
- Sell
- Dividend
- Interest
- Fee
- Tax
- Deposit/withdrawal
- Stock split later

Track:
- Security/ticker/exchange/currency
- Acquisition lots
- Quantity
- Cost basis
- Current/latest price + timestamp/source
- Market value
- Realized/unrealized gains
- Dividends/fees/taxes
- Native and base-currency values

Market prices may be delayed depending on provider/licensing. UI must show quote freshness.

### Multi-currency
- User has a base currency.
- Every financial amount preserves native currency.
- Historical reporting uses historical FX where required.
- Current net worth uses current/latest available FX.
- Price/FX timestamps are visible/traceable.

### Net worth
`net worth = total assets - total liabilities`

Current view includes contribution by account/asset type and drill-down to source data.

The implemented cash-ledger view is the default landing page. It shows assets, liabilities and net worth separately for each native currency, including archived accounts and investment cash only. Positive balances are assets and negative balances are liabilities, including bank overdrafts and credit-card overpayments. Accounts opening after the configured business date are listed separately and excluded until that date. Totals retain exact decimal precision and show their business date and calculation timestamp. No combined FX total or security valuation is available yet. Categories are available for manual assignment.

Historical net-worth snapshots/views show change over time without retroactively rewriting history because of today's FX/prices.

### Reconciliation
Later release:
- statement ending balance;
- calculated balance;
- difference;
- reconciliation period/status;
- missing/duplicate investigation.

### Auditability and traceability
Meaningful changes preserve who/when/what changed.

Imported transactions retain lineage to import batch and original input representation.

A displayed net-worth value must be explainable down to accounts and underlying transactions/holdings.

### Data quality
Surface actionable issues such as:
- unreconciled accounts;
- possible duplicates;
- uncategorized transactions;
- missing expected transactions;
- stale market prices/FX;
- failed import rows.

### Export and portability
At minimum:
- CSV transaction export
- account export
- investment export
- full machine-readable backup format later

The user must never be trapped in the application.

## Product outcomes, not just features

### Excel import
Outcome: a user can migrate historical finances without manually recreating individual transactions.

### Investment dashboard
Outcome: a user can understand current portfolio value, cost basis, gains/losses, allocation, and contribution to net worth without external calculations.

### Reconciliation
Outcome: a user can determine whether the application's ledger matches the authoritative statement and investigate discrepancies.

### Net worth
Outcome: a user can trust and explain the current value and understand how it changed over time.

## Non-functional requirements

- Self-hostable on Synology NAS via Docker Compose.
- Public source repository must contain no private financial data/secrets.
- Responsive UI.
- Reasonable accessibility.
- Deterministic/tested financial calculations.
- Automated database migrations.
- Backup and documented restore process.
- Health checks and useful structured logs.
- Security updates/dependency maintenance considered part of product ownership.

Spending uses `#/spending`; `#/planning` remains a compatibility alias. Net worth remains the landing page. Pie slices represent top-level inclusive expenses plus uncategorized expenses before refunds, counting each expense once. Refund-only periods retain table rows with an explanatory chart empty state. Parents expand into direct and child amounts; zero-activity categories are optional. Normal-setting links select the corresponding category. Current-period exception editors offer Only this period or Make this the normal limit; promotion removes that same exception atomically. Monthly views use monthly exceptions/defaults first, otherwise annual exceptions/defaults compared with year-to-date spending. Yearly views use annual exceptions/defaults first, otherwise sum monthly allowances through the current month (full current-month allowance). Rolled-up totals are read-only with an Edit months breakdown. Spending used and its dates identify comparisons that differ from displayed period activity.
