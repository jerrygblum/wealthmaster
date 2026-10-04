# Architecture

## Style

A modular monolith with a React SPA and Spring Boot REST API backed by PostgreSQL.

```text
Browser
  |
React / TypeScript
  |
REST /api/v1
  |
Spring Boot modular monolith
  |-- identity/security
  |-- accounts
  |-- ledger
  |-- budgets
  |-- imports
  |-- investments
  |-- market data
  |-- net worth
  |-- audit
  |
PostgreSQL
```

Deployment is Docker Compose on a Synology NAS. Scale is intentionally modest; correctness, maintainability, security, and traceability are prioritized over distributed architecture.

## Source of truth

The ledger is authoritative for ordinary financial activity.

```text
opening balance + ledger movements = account balance
```

Investment positions are derived from investment transactions/lots. Current valuation combines positions with latest available market price and FX data.

Net worth is derived from account balances, investment values, and liabilities.

## Domain principles

### Money
- Java `BigDecimal`, PostgreSQL `NUMERIC`.
- Currency always explicit.
- No binary floating-point persistence/calculation for financial amounts.

### Transfers
A transfer represents linked movements between owned accounts and has zero impact on spending/income totals.

### Credit cards
Credit-card purchases generate expenses/liability. Card repayment reduces the card liability and bank asset through a transfer; it is not a second expense.

### Investments
Buying/selling an asset changes portfolio composition; it is not ordinary spending/income. Fees/taxes are tracked separately. Acquisition lots are retained.

### Account lifecycle

An account can be edited or permanently deleted while it has no financial activity. An opening balance alone is not activity. Once activity exists, type, currency, opening balance, and opening date are locked; name and institution remain editable. Archive/restore is reversible. Archived accounts retain their balances and valuation contributions; future writers must reject new activity until restoration.

Mutations require the version returned in the account response, quoted in `If-Match`. Owner-scoped row locks serialize checks and writes; JPA versioning detects stale requests. Account changes and audit snapshots commit together. Audit resource IDs intentionally survive account deletion without a foreign key to the account.

`AccountUsagePolicy.ActivitySource` is the integration point for ledger, imports, and investments. The cash ledger contributes a permanent `ledger_account_history` reference check, including moved and soft-deleted operations. Before introducing account references, each module must register a history/reference check, including reversed/soft-deleted records, and use restrictive account foreign keys. Future writers must lock referenced accounts before checking active status or writing activity, using UUID order when locking multiple accounts. This prevents activity creation racing with deletion, financial setup edits, or archiving. Never cascade-delete account history.

See [investment cash and holdings design](docs/adr/006-investment-cash-and-holdings.md).

### Imports
Imports create staged normalized records before committing ledger/investment activity. Original source representation and lineage are preserved.

## Multi-tenancy

Application-level multi-user isolation. All aggregate roots are owned directly or transitively by a user. Authorization is enforced server-side.

Do not accept a frontend-provided user ID as proof of ownership.

## API

REST under `/api/v1`.

Initial planned resources:

```text
/api/v1/accounts
/api/v1/transactions
/api/v1/transfers
/api/v1/categories
/api/v1/budgets
/api/v1/expected-transactions
/api/v1/imports
/api/v1/investments
/api/v1/securities
/api/v1/net-worth
```

DTOs form the external contract; JPA entities are internal persistence details.

## Database migrations

Flyway owns production schema evolution.

```text
V001__baseline.sql
V002__users_and_accounts.sql
V003__mfa.sql
V004__account_management.sql
...
```

Hibernate automatic schema mutation is disabled outside disposable development contexts.

## Dates

- Business dates: SQL `DATE` / Java `LocalDate`.
- System events: UTC timestamp / Java `Instant`.
- Never manufacture a timezone for a bank transaction that only provides a date.

## Import architecture

```text
CSV/XLSX/PDF/API
      |
     parser
      |
 raw import records (immutable lineage)
      |
 normalization
      |
 validation
      |
 duplicate detection
      |
 categorization
      |
 review / preview
      |
 commit service
      |
 ledger / investment activity
```

A parser must not directly write final ledger rows.

## Audit

Audit events cover meaningful financial/business-data changes and import lifecycle changes. Logs and audit history are distinct concerns: application logs are operational; audit events describe business changes.

## Operations

Containers initially:

```text
frontend
backend
postgres
```

A worker/queue may be introduced only once asynchronous work (large PDF imports, scheduled market refreshes, etc.) creates a demonstrated need.

See `docs/operations/`.

### Cash ledger implementation

`ledger_operations` holds owner, kind, positive amount, business dates, metadata, version, and soft-deletion status. `ledger_movements` holds explicit-currency signed cash movements. Income/refunds increase balances, expenses decrease them; refunds reduce spending. Transfers create a negative source and positive destination movement atomically and are excluded from income/spending. Investment accounts expose cash only; credit-card positions remain signed. No balance cache or artificial opening transactions exist. Account list/detail reads use a repeatable database snapshot so concurrent transfers or setup edits cannot mix opening balances and movements from different commits.

Operation edits lock the owner-scoped operation first, then original/current and new accounts in UUID order. Account writers use the same account row locks. Movement replacement, permanent account references, and before/after audit snapshots share a database transaction. Transfer endpoints require distinct active owned accounts in the same currency. Insufficient funds never prevent recording activity. Ordinary endpoints cannot modify transfer sides.

Dates use `LocalDate`; today uses `APP_BUSINESS_TIME_ZONE` (default `Europe/Zurich`). Transaction and optional value dates must fall between affected account opening dates and today. Audit timestamps remain UTC. Paginated activity returns 50 operations ordered by transaction date descending, creation timestamp descending, then ID. Categories, fees, FX, refund-purchase links and security trades remain deferred.

### Current net worth implementation

`networth` exposes owner-scoped `GET /api/v1/net-worth/current`. Its read-only repeatable-read transaction calls `AccountService` so opening balances and ledger movements share one PostgreSQL snapshot, including during concurrent transfers or account edits. No cached balances, persisted report rows, audit writes or schema changes are needed.

Positive signed balances contribute to assets; absolute negative balances contribute to liabilities. Totals and account-type breakdowns use `BigDecimal` and decimal-string DTOs, without imposing input digit limits on aggregates. Archived accounts remain included; accounts opening after the business date appear separately. Investment valuation currently covers cash only. Currencies are never combined without FX data.

Shared injectable `BusinessTime` derives business dates from the application `Clock` and `APP_BUSINESS_TIME_ZONE` (default `Europe/Zurich`); calculation timestamps remain UTC instants. The API disables HTTP caching. The frontend defaults to `#/net-worth`, reloads the report on entry, and links each contribution to its account activity.
