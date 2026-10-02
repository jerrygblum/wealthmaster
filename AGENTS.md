# AGENTS.md

## Purpose

This repository implements a self-hosted personal wealth tracker. The primary user goal is to replace an existing Excel-based financial workflow and calculate trustworthy current and historical net worth.

The project has a second goal: demonstrate end-to-end product ownership and the discipline required to move from POC to reliable operational software.

Read `PRODUCT.md` and `ARCHITECTURE.md` before making domain or schema changes.

## Product context

- Initially used by one owner.
- Must support multiple isolated users from the start.
- May later be shared with a small number of friends/family.
- Do not design for internet-scale traffic.
- Production target is a Synology NAS using Docker Compose / Container Manager.
- The repository is intended to be public and portfolio-quality.
- Production data, secrets, account identifiers, statements, and backups are never committed.

## Technology stack

### Backend
- Java 25 LTS
- Spring Boot 4.1.x
- Maven
- Spring Web
- Spring Data JPA
- Spring Security
- Bean Validation
- PostgreSQL
- Flyway migrations
- JUnit 5
- Testcontainers for database integration tests

### Frontend
- React
- TypeScript
- Vite
- Keep the component system consistent once chosen.
- Vitest for unit/component tests.
- Playwright for critical user journeys.

### Deployment
- Docker
- Docker Compose
- Synology Container Manager
- Do not introduce Kubernetes for this deployment.

## Financial invariants

These rules are non-negotiable unless an ADR explicitly replaces them.

1. Net worth = assets - liabilities.
2. The ledger is the authoritative source for account activity.
3. Account balances are derived from opening balance plus ledger movements. Cached balances may exist later but are not authoritative.
4. Transfers between accounts owned by the same user never count as income or spending.
5. Credit-card purchases are expenses; paying the credit-card bill is a transfer.
6. Buying/selling investments is investment activity, not ordinary income/expense. Fees and taxes may be costs.
7. Persisted monetary calculations must never use binary floating-point types. Use Java `BigDecimal` and PostgreSQL `NUMERIC`.
8. Every monetary amount has an explicit ISO 4217 currency.
9. Security quantities and prices require sufficient decimal precision for fractional holdings.
10. Historical reports use the relevant historical FX/price data. Current net worth uses latest available prices/FX and records quote timestamps.
11. Imported original source data is preserved. User edits never silently overwrite the source representation.
12. Duplicate detection is conservative and reviewable. Do not silently delete uncertain duplicates.
13. Import operations should be traceable and reversible.
14. Investment acquisition lots are preserved even if the initial UI only shows average cost.

## Dates and timestamps

- Use `LocalDate` for business dates such as transaction date, value date, budget month, and trade date when time-of-day is irrelevant.
- Use timezone-aware `Instant` for system/audit timestamps, import times, price timestamps, login events, etc.
- Persist timestamps in UTC.
- Do not convert date-only financial fields through time zones.

## Security rules

- MFA is mandatory for normal user accounts once authentication is implemented.
- Start with TOTP + recovery codes; WebAuthn/passkeys may follow.
- Never implement custom cryptography.
- Enforce resource ownership server-side on every protected request.
- Never trust a `userId` supplied by the frontend as authorization.
- Uploaded statements/files are sensitive data.
- Secrets come from environment variables or mounted secrets.
- Production must run with secure defaults and HTTPS when exposed beyond a trusted local network.
- Do not log secrets, full bank account numbers, MFA secrets, statement contents, or sensitive uploaded documents.

## Data/import rules

The import subsystem is generic. CSV, XLSX, PDF, and future bank/broker integrations normalize into reviewable import records before ledger creation.

Preferred flow:

`source -> parse -> normalize -> validate -> duplicate detection -> categorize -> preview/review -> commit`

- XLSX/CSV come first.
- PDF imports use the same normalization pipeline later.
- Save import mappings/profiles per user/source.
- Keep import batch lineage and original values.
- Categorization priority: explicit user rule -> learned merchant mapping -> classifier suggestion -> uncategorized.
- Automatic categorization must remain user-correctable and expose its source/confidence where applicable.

## Architecture rules

- Prefer a modular monolith.
- Domain rules belong in backend domain/application services, not React components or controllers.
- Controllers should be thin.
- Repositories should not contain business policy.
- Prefer explicit DTO/API boundaries; do not expose JPA entities directly from controllers.
- Use REST under `/api/v1`.
- Add/update OpenAPI documentation as APIs mature.
- All database schema changes require Flyway migrations.
- Never use Hibernate auto-DDL to mutate production schemas.
- Avoid abstractions justified only by hypothetical scale.

## Module boundaries

Expected backend areas:
- `users` — identity/profile/security concerns
- `accounts` — financial accounts and ownership
- `ledger` — transactions, splits, transfers
- `budgets` — categories, limits, expected transactions
- `imports` — source ingestion and normalization
- `investments` — securities, trades, lots, holdings
- `marketdata` — prices and FX rates
- `networth` — derived net-worth views/history
- `audit` — meaningful business-data change history

Do not collapse the system into one generic `finance` module.

## Development priorities

Build in this order unless `PRODUCT.md`/roadmap is explicitly changed:

1. Project/CI/deployment foundation
2. Authentication + MFA
3. Accounts
4. Ledger transactions and transfers
5. Categories
6. Current net worth
7. CSV/XLSX import
8. Budgets and expected/fixed transactions
9. Categorization rules + duplicate handling
10. Investments
11. Market prices + FX
12. Historical net worth
13. PDF imports
14. Reconciliation and analytics

## Definition of done

A feature is not done when the happy-path UI merely works.

For applicable changes:
- Acceptance criteria are satisfied.
- Domain logic has automated tests.
- Schema changes include Flyway migrations.
- Authorization/ownership is covered.
- Error/empty/loading states are handled.
- No secrets or sensitive data are introduced.
- API/documentation is updated.
- CI passes.
- Relevant operational implications are documented.
- UI is usable on desktop and mobile-sized screens.
- Accessibility basics are respected.

## Agent behavior

- Make the smallest coherent change that completes the requested outcome.
- Do not add dependencies without a clear reason.
- Do not change financial invariants without explicit approval and an ADR.
- Prefer data preservation over destructive assumptions.
- Do not invent requirements silently; record meaningful assumptions.
- Do not build features listed as later/out-of-scope unless requested.
- Do not introduce Redis, Kafka, Celery-style workers, microservices, or orchestration until a demonstrated need exists.
- Keep public demo data fully synthetic.
- Never copy real financial data into fixtures/tests/examples.

## Out of scope until explicitly requested

- Shared household ownership/permissions
- Native mobile applications
- Kubernetes
- Microservices
- Direct open-banking sync
- Automated brokerage sync
- Tax filing/advice
- AI financial advice
- Social/public features
- Crypto-specific tracking
