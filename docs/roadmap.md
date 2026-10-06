# Product Roadmap

## 0.0 — Foundation
Goal: establish a public-ready repository and repeatable local/NAS deployment foundation.

- [x] Product/architecture/agent documentation
- [x] Spring Boot skeleton
- [x] React/TypeScript/Vite skeleton
- [x] PostgreSQL + Docker Compose
- [x] CI skeleton
- [ ] Production Synology deployment documentation validated
- [ ] First backup/restore drill

Deployment validation and the first backup/restore drill are explicitly deferred while the first login/accounts slice is built.

## 0.1 — Identity + Core Ledger
Goal: represent financial accounts and trustworthy manual activity.

- [x] Email/password login, server sessions, initial owner setup
- [ ] Self-service registration page
- [x] TOTP MFA + recovery codes, required in production and optional enrollment in development
- [x] Security settings, verified activation, authenticator replacement, recovery-code regeneration
- [x] Multi-user isolation for account creation/listing
- [x] Financial account creation and owner-scoped listing
- [x] Opening balances
- [x] Account editing, unused-account deletion, archive/restore, version checks, and audit snapshots
- [x] Investment cash/holdings architecture documented (implementation deferred)
- [x] Manual income/expense/refund transactions, corrections, soft deletion and audit snapshots
- [x] Same-currency paired transfers
- [x] Two-level income/spending categories, manual assignment, lifecycle history and optional starters
- [x] Calculated current account cash balances
- [x] Current cash net worth by native currency, account/type breakdown and default overview
- [x] Core cash ledger unit/integration tests, ownership, concurrency and audit rollback

Release outcome: the user can reproduce current cash/bank/card positions without Excel.

## 0.2 — Migration / Importer (deferred)
Goal: migrate historical Excel workflow without manual re-entry.

- CSV import
- XLSX import
- Sheet selection
- Column detection/mapping
- Saved import profiles
- Preview/validation
- Import batches + lineage
- Duplicate detection
- Rollback/undo
- Initial categorization rules

Release outcome: existing historical Excel/CSV data can be migrated confidently.

## 0.3 — Spending and planning (current priority)
Goal: understand budgets and expected cash flow. Imports are explicitly deferred. Recurring expectations remain deferred; matching and forecasts follow. Income targets, rollover and FX conversion remain deferred.

- [x] One current linked monthly/yearly limit per main spending category, saved with category CRUD; selected-period comparisons, confirmed currency resets and pre-production override/revision cleanup (V010/V011)
- Expected recurring expenses/income
- Matching actual transactions to expectations
- Missing expected items by period
- [x] Compact inline category limit forms with linked unit conversion and read-only Spending comparisons
- [x] Spending dashboard with gross expense pie, refunds, exact hierarchy breakdowns, overlap-safe comparisons and activity without budgets
- Basic cash-flow projection

## 0.4 — Wealth / Investments
Goal: represent investment wealth accurately.

- Investment accounts
- Securities (stocks/ETFs)
- Buy/sell/dividend/fee/tax activity
- Acquisition lots
- Holdings/cost basis
- Market-price provider abstraction
- FX provider abstraction
- Current portfolio value
- Realized/unrealized gain/loss
- Investment contribution to net worth

## 0.5 — Automation
Goal: reduce manual intervention.

- Improved merchant normalization
- Explainable automatic categorization
- Confidence/review workflow
- PDF card/bank statement import
- Broker statement import if needed
- Import quality metrics

## 0.6 — Trust + Analytics
Goal: make financial correctness visible.

- Reconciliation
- Data-quality dashboard
- Historical net-worth chart
- Spending trends
- Savings rate
- Portfolio performance
- Audit UI

## 1.0 — Personal production release
Goal: confidently replace the spreadsheet long-term.

- Synology production deployment documented/tested
- Backup/restore tested
- Monitoring/health checks
- Security review/threat model
- Dependency update process
- Data export/backup portability
- Synthetic demo account/data
- Public portfolio documentation/screenshots
- Known limitations documented
