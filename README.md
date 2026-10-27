# Wealth Master

A self-hosted personal finance and net-worth application designed to replace an Excel-based finance workflow while demonstrating end-to-end product ownership and production-minded software delivery.

> **Status:** active development — email/password login, authenticator 2FA, security settings, financial account management, manual cash activity/transfers, current cash net worth, categories, spending, guided legacy-workbook migration, and investment holdings/purchases/sales implemented.

## Product goals

1. Replace the owner's existing Excel workflow for personal finance tracking.
2. Provide a trustworthy ledger for accounts, budgets, investments, imports, and net worth.
3. Take a real application beyond POC quality: security, testing, observability, backup/restore, documentation, and release discipline matter.
4. Serve as a public portfolio project with a fully synthetic demo dataset.

## Planned capabilities

- Multi-user accounts with mandatory MFA
- Multiple bank, cash, credit-card, and investment accounts
- Income, expenses, transfers, transaction splits, and categories
- Guided XLSX/XLSM legacy-workbook migration with Visa/account mapping, reviewable
  uncategorized transactions with original labels preserved, an editable ledger preview, monthly card settlements,
  duplicate review, balance preview and guarded rollback
- Category mapping workspace: review original-category groups and their transactions, then apply an existing compatible category in bulk
- Reusable CSV/XLSX bank-statement imports later
- PDF statement imports later through the same generic import pipeline
- Monthly/yearly budgets and expected recurring costs/income
- Manual stock/ETF/fund holdings, opening lots, purchases/sales and actual account-currency settlement
- Funds identified by ISIN, with dated manual NAVs, source references, correction history and account/net-worth valuation
- Keyless market prices, daily price trends and explicit FX valuation of holdings
- Investment gains/losses later
- Current and historical net-worth calculation
- Reconciliation, audit history, data-quality checks, and exports

See [PRODUCT.md](PRODUCT.md), [docs/roadmap.md](docs/roadmap.md), and [2FA setup and recovery](docs/operations/mfa.md).

## Technology

- Java 25 LTS
- Spring Boot 4.1.x
- PostgreSQL
- Flyway
- React 19 + TypeScript + Vite
- Docker Compose
- JUnit / Testcontainers
- Vitest / Playwright (as frontend coverage grows)
- GitHub Actions

## Architecture

The financial ledger is the source of truth. Dashboards, balances, budgets, portfolio values, and net worth are derived from ledger and investment activity rather than being independent authoritative values.

See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/adr](docs/adr/), and the [OpenAPI contract](docs/api/openapi.json).

Account management supports editing, confirmed deletion of unused accounts, and archive/restore. See the [investment cash/holdings design](docs/adr/006-investment-cash-and-holdings.md) for the cash and holdings model. [Investment operations](docs/operations/investments.md) now supports existing holdings, purchases and sales per investment account, with reviewed acquisition lots and actual cash settlement. The holdings overview includes keyless stock/ETF search, latest Yahoo Finance quotes, daily trends and FX-based account valuation. Fees/taxes can be recorded separately as spending. Missing or older quotes are clearly marked. See [account management operations](docs/operations/account-management.md) for migration and audit implications. The default [net-worth overview](docs/operations/net-worth.md) shows assets, liabilities and account contributions per native currency, including active accounts and investment cash plus priced holdings; archived accounts are excluded. See [category operations](docs/operations/categories.md) for manual classification and lifecycle rules. [Spending](docs/operations/spending.md) shows expenses, refunds and net spending by category for a selected month or year, in separate native currencies. Expand main categories for direct and child breakdowns and open supporting transaction activity. Categories use compact CRUD rows without limits. Budgeting and reusable bank-statement imports remain deferred; V012 removes remaining limit data while preserving ledger, categories, currency preferences and audit history.

## Local development

### Prerequisites

- Java 25
- Maven 3.9+
- Node.js 24+ / npm
- Docker + Docker Compose

### Start PostgreSQL

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

Fill the initial owner credentials and MFA encryption configuration in `.env` and load it into the backend shell. See [local login setup](docs/operations/local-auth.md) for instructions and test setup.

### Backend

```bash
cd backend
mvn spring-boot:run
```

Health check: `http://localhost:8080/actuator/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

### Run everything with Docker

Only Docker + Docker Compose are required for this option; Java, Maven and Node.js
run inside the image builds. On first setup, copy `.env.example` to `.env` if it
does not already exist, then fill the initial owner credentials and MFA encryption
values as described in [local login setup](docs/operations/local-auth.md).
Use `SPRING_PROFILES_ACTIVE=dev` and `SESSION_COOKIE_SECURE=false` for local HTTP.
Compose reads `.env` automatically.

```bash
docker compose up --build
```

Open http://localhost:8088. After changing source files, rerun the command to rebuild
the images. Stop with `docker compose down`; the named database volume is retained.

To add synthetic sample accounts, categories, and three months of transactions to
the running local app, run `python3 scripts/seed-demo.py`. This optional helper
requires Python 3.9+, the explicit `dev` profile, and the existing owner's current
login credentials in the initial-owner variables in `.env`. It signs in through
the API; accounts with MFA enabled require an interactive flow instead. It adds
clearly labeled demo data without changing existing entries. Reruns skip matching
demo account/category names and transaction descriptions; keep those labels intact
to avoid creating duplicates. Transfers, credit-card purchases/payments, refunds,
uncategorized spending, and separate CHF/EUR balances are included. Investment
sample balances represent cash only.

PostgreSQL 18 requires the data volume mounted at `/var/lib/postgresql`, with the
database stored under `18/docker`; see the [official image documentation](https://hub.docker.com/_/postgres).
If you used the previous `/var/lib/postgresql/data` mount and startup failed before
database initialization, rerunning the command above recreates the container with
the corrected mount. If that volume contains an existing database, back it up and
plan a migration before restarting: changing the mount does not migrate its data.
Do not use `docker compose down -v` to resolve the error; it deletes the database volume.

For NAS production deployment using images published by GitHub Actions, see the
[deployment runbook](docs/operations/deployment.md). Use the standalone
`docker-compose.prod.yml` and `.env.production.example`; the local development
environment example is not suitable for production. For subsequent NAS updates,
copy `scripts/deploy-nas.sh` to the deployment directory and run it with the
published image tag; it backs up PostgreSQL/configuration before updating and
checks application health. See the runbook for usage and recovery.

## Repository guide

- `AGENTS.md` — rules for coding agents and contributors
- `PRODUCT.md` — product requirements and domain outcomes
- `ARCHITECTURE.md` — architecture and financial invariants
- `docs/roadmap.md` — release roadmap
- `docs/success-metrics.md` — product and data-quality measures
- `docs/adr/` — architecture decision records
- `docs/operations/` — deployment, backup/restore, monitoring
- `backend/` — Spring Boot API
- `frontend/` — React application

## Demo policy

Any public demo must use fully synthetic financial information. Real or anonymized personal financial data must never be committed or used as demo seed data.

## Security

Do not report vulnerabilities through a public issue. See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

See [frontend development and atomic design](frontend/README.md) for linting, formatting, editor setup and component conventions.

For short development cycles, run frontend `npm run test:related -- <changed-source-files>` or watch mode and focused backend unit tests. Run local lint/format/type checks before completion; full browser journeys remain in CI by default. See [frontend development](frontend/README.md#fast-development-checks).
