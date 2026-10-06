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

Dates use `LocalDate`; today uses `APP_BUSINESS_TIME_ZONE` (default `Europe/Zurich`). Transaction and optional value dates must fall between affected account opening dates and today. Audit timestamps remain UTC. Paginated activity returns 50 operations ordered by transaction date descending, creation timestamp descending, then ID. Fees, FX, refund-purchase links and security trades remain deferred.

### Current net worth implementation

`networth` exposes owner-scoped `GET /api/v1/net-worth/current`. Its read-only repeatable-read transaction calls `AccountService` so opening balances and ledger movements share one PostgreSQL snapshot, including during concurrent transfers or account edits. No cached balances, persisted report rows, audit writes or schema changes are needed.

Positive signed balances contribute to assets; absolute negative balances contribute to liabilities. Totals and account-type breakdowns use `BigDecimal` and decimal-string DTOs, without imposing input digit limits on aggregates. Archived accounts remain included; accounts opening after the business date appear separately. Investment valuation currently covers cash only. Currencies are never combined without FX data.

Shared injectable `BusinessTime` derives business dates from the application `Clock` and `APP_BUSINESS_TIME_ZONE` (default `Europe/Zurich`); calculation timestamps remain UTC instants. The API disables HTTP caching. The frontend defaults to `#/net-worth`, reloads the report on entry, and links each contribution to its account activity.

### Category implementation

The `budgets` module owns category management; the ledger owns assignment. Categories have two levels with matching owner/type. Income categories are separate from spending categories used by expenses and refunds. `ledger_operations.category_id` is nullable; transfers remain uncategorized. Categories do not alter movements, balances, or net worth.

Flyway V006 adds categories, per-owner state, and permanent `ledger_category_history`. Every assignment retains both the selected category and its parent. References survive recategorization, clearing and soft deletion, permanently locking type/parent and preventing deletion. Roots with children also lock structure. Restrictive, owner-matching foreign keys protect references. Existing activity remains uncategorized.

Category writes serialize on a lazily-created `category_owner_state` row. Ledger assignment/removal acquires it after existing operation/account locks; category management never acquires ledger/account locks. Validation, history, movements and audit snapshots commit together. Read paths do not create owner-state rows; list reads use repeatable snapshots.

Archiving a parent changes effective branch availability while retaining child active flags. Existing unavailable assignments may survive unrelated ledger edits; new assignments require an active branch and matching type. Nullable transaction `categoryId` uses full-replacement PUT semantics: omission clears it. Responses include current labels; audit snapshots capture labels at the time of changes.

Starter installation is explicit, atomic, available for an empty list and recorded once per owner. The UI adds `#/categories`; net worth remains the default route.

### Spending budget implementation

Flyway V007 adds `spending_budgets` with independent MONTH/YEAR calendar periods, native currency, NUMERIC(28,8) non-negative limits, versions and soft deletion. A partial unique index permits one live limit per owner/category/currency/period. `budget_category_history` preserves selected and parent references permanently; CategoryService usage combines ledger, period-budget and normal-setting history.

All budget writes and copies take only the existing per-owner category lock. They never acquire account or ledger-operation locks. Limit mutations and before/after audit snapshots commit atomically. Copy validates every owned source version before writes, requires a single source period and different canonical target, and preserves existing target limits. Archived branches remain readable/editable/deletable but cannot receive new limits or copies.

Report and supporting-activity reads use a read-only repeatable-read snapshot and disable HTTP caching. Actuals derive from non-deleted expenses minus refunds by transaction date and currency, including archived accounts and category branches. Parent actuals include directly assigned activity and immediate children. Effective coverage resolves defaults/exceptions for each operation date, so overlapping category budgets count each operation once. Totals never sum overlapping limits. BigDecimal values become exact decimal strings; only percentage is rounded HALF_UP to two places, with null for zero limits. No ledger writes, cached totals, FX, scheduled jobs or balance effects are introduced.

`GET /api/v1/budgets` defaults to the current business month through BusinessTime. Normal limit management lives in Categories, period exceptions in Spending; net worth remains the default landing page. Recurring expectations/matching/forecasts are next; imports are deferred.

### Spending distribution implementation

The budgets module exposes `GET /api/v1/spending` and `/api/v1/spending/activity` using the budget persistence. Each entry point runs in one read-only REPEATABLE_READ transaction; nested category and budget reads participate in that snapshot. Responses use Cache-Control: no-store. Reports group owner-scoped non-deleted expense/refund operations by assigned category and currency, preserving separate gross amounts and exact BigDecimal net values. Inclusive rollups add immediate children; the pie consumes only root rollups and uncategorized gross expenses. Budget coverage and comparisons reuse the selected-period rules; overlapping limits are never summed.

Activity accepts currency and optional owned spending category, including immediate children or uncategorized when omitted. It retains 50-row ledger ordering and account links without requiring a budget. All monetary DTOs are decimal strings; the frontend uses bounded BigInt-derived approximations only for SVG geometry. No caching, jobs, dependencies or ledger mutations are added. `#/planning` aliases `#/spending`; normal-setting links carry category context.

### Dated normal limits

Flyway V008 adds owner/category/currency heads (`budget_settings`), append-only month/year effective revisions (`budget_setting_revisions`) and permanent category references (`budget_setting_category_history`). Existing V007 rows remain explicit exceptions; migration does not infer defaults. Every normal save appends both frequency revisions effective at the current month/year boundary: the selected mode carries its amount, the other carries null (disabled). Latest effective date/version resolves earlier periods without backfilling. No limit retains the head, revisions and exceptions.

EffectiveBudgetService resolves monthly exception/default before annual exception/default. Annual comparisons use YTD net spending through the selected month, capped at the business date. Year reports prefer annual exception/default, otherwise accrue individual monthly limits through the current month; future months contribute zero. Parent comparisons include direct assignments and immediate children. Gross chart/table amounts remain in the selected report period; comparison usage dates are explicit. All report reads share one repeatable-read snapshot.

Normal and effective-limit writes hold the existing owner category lock. Body references check both expected setting and period exception versions (including expected absence), returning 412 for stale state. Current-period promotion saves the normal revision and soft-deletes the corresponding exception in one audited transaction. Past/future edits cannot promote. Archived branches permit existing same-frequency edits and exception reset, but no new limits. The monthly breakdown provides twelve independently editable monthly exceptions while annual monthly-rollup totals remain read-only.

### Frontend composition and quality checks

The React frontend follows atomic design: native control atoms, reusable field/action/feedback molecules, feature organisms, layout templates and page controllers. Pages compose templates and controlled organisms; feature hooks own requests and mutation state. The API client and DTO/prop types are separate boundaries, and pure presentation helpers preserve decimal strings. ESLint enforces downward UI imports and prevents components from importing requests, feature hooks or pages. Shared type-only view models carry no runtime hook dependency.

Prettier formats frontend sources and configuration; ESLint checks typed correctness, hook usage, accessibility and Fast Refresh compatibility. CI checks both plus tooling-rule tests before the existing build/tests. Editor format-on-save is scoped by the frontend Prettier configuration; no commit hooks are installed. See [frontend development](frontend/README.md) for commands and component placement. This refactor preserves routes, API contracts, financial behavior and the existing visual design.
