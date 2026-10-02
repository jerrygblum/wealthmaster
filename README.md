# Wealth Master

A self-hosted personal finance and net-worth application designed to replace an Excel-based finance workflow while demonstrating end-to-end product ownership and production-minded software delivery.

> **Status:** scaffolding / active development

## Product goals

1. Replace the owner's existing Excel workflow for personal finance tracking.
2. Provide a trustworthy ledger for accounts, budgets, investments, imports, and net worth.
3. Take a real application beyond POC quality: security, testing, observability, backup/restore, documentation, and release discipline matter.
4. Serve as a public portfolio project with a fully synthetic demo dataset.

## Planned capabilities

- Multi-user accounts with mandatory MFA
- Multiple bank, cash, credit-card, and investment accounts
- Income, expenses, transfers, transaction splits, and categories
- CSV/XLSX transaction imports with mapping, preview, duplicate detection, and rollback
- PDF statement imports later through the same generic import pipeline
- Monthly/yearly budgets and expected recurring costs/income
- Stock/ETF trades, holdings, lots, prices, FX conversion, gains/losses
- Current and historical net-worth calculation
- Reconciliation, audit history, data-quality checks, and exports

See [PRODUCT.md](PRODUCT.md) and [docs/roadmap.md](docs/roadmap.md).

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

See [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/adr](docs/adr/).

## Local development

### Prerequisites

- Java 25
- Maven 3.9+
- Node.js 24+ / npm
- Docker + Docker Compose

### Start PostgreSQL

```bash
cp .env.example .env
docker compose up -d postgres
```

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

```bash
docker compose up --build
```

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
