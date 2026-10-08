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
/api/v1/spending
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

### Spending by period and category

The budgets module retains category management and spending reporting; no module reorganization is introduced. SpendingService aggregates owner-scoped ledger expenses and refunds directly using BigDecimal. SpendingPeriod validates calendar starts and resolves business-month/year defaults and exclusive period ends. Activity is capped at the day after the business date; future periods return no activity.

GET /api/v1/spending and /spending/activity run in single read-only REPEATABLE_READ snapshots and disable caching. Report aggregation establishes the snapshot before category labels are loaded, so concurrent corrections cannot mix amounts and labels. Currencies remain separate. Reports contain direct and inclusive parent expense/refund/net amounts, uncategorized net totals and business dates. Income, transfers, opening balances and deleted operations are excluded; archived activity remains included.

Supporting activity includes immediate children or uncategorized activity when no category is selected, retaining 50-row ledger ordering and account links. Category CRUD calls CategoryService directly with optimistic category versions. Permanent ledger and expectation references, plus existing children, restrict category structure/deletion.

Historical Flyway V007/V008 introduced budgeting, V010 removed subcategory limits, and V011 removed period overrides and dated revisions. Pre-production V012 drops remaining budget_settings and budget_setting_category_history. Ledger/category data, user_preferences and audit events survive. All budget APIs and category limit inputs are retired without a compatibility layer.

The frontend uses a compact category table with expandable parent breakdowns and labeled mobile rows. Monetary displays round exact decimal strings to two decimals. There are no charts, limits or comparisons. #/planning remains an alias for #/spending. No ledger mutations, caches, jobs or FX conversion are introduced.

### Frontend composition and quality checks

The React frontend follows atomic design: native control atoms, reusable field/action/feedback molecules, feature organisms, layout templates and page controllers. Pages compose templates and controlled organisms; feature hooks own requests and mutation state. The API client and DTO/prop types are separate boundaries, and pure presentation helpers preserve decimal strings. ESLint enforces downward UI imports and prevents components from importing requests, feature hooks or pages. Shared type-only view models carry no runtime hook dependency.

Prettier formats frontend sources and configuration; ESLint checks typed correctness, hook usage, accessibility and Fast Refresh compatibility. CI checks both plus tooling-rule tests before the existing build/tests. Editor format-on-save is scoped by the frontend Prettier configuration; no commit hooks are installed. See [frontend development](frontend/README.md) for commands and component placement. This refactor preserves routes, API contracts, financial behavior and the existing visual design.

### Owner currency preference

Flyway V009 adds owner-scoped user_preferences with nullable default_currency and optimistic version. GET /users/me/preferences is a no-store repeatable-read snapshot. PUT validates ISO 4217 codes, checks the preference version and records an audit event atomically under the existing owner lock. Currency changes no longer detect or reset limits. The preference does not change transaction currencies or convert spending totals. No currency is inferred.

### Expected monthly activity

The budgets module owns monthly definitions and reconciliation; LedgerService remains the only actual-activity writer. V013 adds expected_transactions, sparse expected_occurrences and permanent account/category references (including category parents). Definitions are versioned and soft-deleted; the latest definition applies to all months. An unchanged, untouched occurrence has version zero; its first reconciliation stores version one. Confirmed links remain unique per ledger operation and are checked against current operation state when read. Historical links outside an edited recurrence remain visible as Needs review.

Owner-scoped mutations serialize on expectation_owner_state, then lock referenced operations/accounts as needed and acquire the category owner lock last. Category writers never acquire expectation/account/operation locks. Restrictive owner-matching foreign keys, permanent reference checks and transactional audits protect deletion and structural changes. Expectations count as account usage and permanently lock account setup and category structure, even after deletion. Reports/candidates use repeatable-read read-only snapshots and no-store responses; reads never create owner-state rows.

GET /expected-transactions returns definitions, monthly occurrences and exact currency/type totals. CRUD uses definition If-Match; reconciliation and record routes use occurrence If-Match plus definitionVersion. Confirming links also checks operationVersion. Suggestions only read same-month unlinked operations; they never mutate state. Reviewed recording calls LedgerService within the expectation transaction, then writes the link; either both commit or both roll back. There are no generated monthly jobs, automatic ledger writes, caches or FX conversions.
