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
- [x] Invitation-only self-service registration, disabled by default, with owner controls and seven-day email invitations
- [x] TOTP MFA + recovery codes, required in production and optional enrollment in development
- [x] Security settings, verified activation, authenticator replacement, recovery-code regeneration
- [x] Multi-user isolation for account creation/listing
- [x] Financial account creation and owner-scoped listing
- [x] Opening balances
- [x] Account editing, unused-account deletion, archive/restore, version checks, and audit snapshots
- [x] Saved account ordering and card accent colors, with owner isolation and version checks
- [x] Investment cash/holdings architecture documented (first release implemented)
- [x] Manual income/expense/refund transactions, corrections, soft deletion and audit snapshots
- [x] Same-currency paired transfers
- [x] Two-level income/spending categories, manual assignment, lifecycle history and optional starters
- [x] Calculated current account cash balances
- [x] Current cash net worth by native currency, account/type breakdown and default overview
- [x] Core cash ledger unit/integration tests, ownership, concurrency and audit rollback

Release outcome: the user can reproduce current cash/bank/card positions without Excel.

## 0.2 — Migration / Importer
Goal: migrate historical Excel workflow without manual re-entry.

- [x] Guided XLSX/XLSM legacy-workbook staging and sheet/column selection
- [x] Explicit account/Visa mappings and reviewable two-level category proposals
- [x] Row decisions, two-row transfer pairing and monthly reconstructed card settlements
- [x] Editable ledger preview, closing-balance reconciliation and duplicate review
- [x] Deletable/re-uploadable drafts with resumable committed receipts
- [x] Import batches, immutable source lineage, atomic commit and guarded undo
- [ ] Reusable CSV/XLSX bank-statement imports and saved profiles
- [ ] Initial categorization rules

Release outcome: existing historical Excel/CSV data can be migrated confidently.

## 0.3 — Spending by category and period (current priority)
Goal: understand actual spending and expected monthly activity. Reusable bank-statement imports, budgets, forecasts and FX conversion remain deferred.

- [x] Compact monthly/yearly spending tables with expenses, refunds, net totals, inclusive category breakdowns and transaction activity
- [x] Consistent category CRUD rows without limits; no pie chart
- [x] Pre-production removal of all budget settings and references (V012), preserving ledger, categories, currency preferences and audit history
- [ ] Budgeting — deferred pending a simpler future design
- [x] Expected monthly income, expenses and transfers, confirmed suggestions, skip/undo and reviewed actual recording
- [x] Upcoming, due, overdue and needs-review expected items
- [ ] Basic cash-flow projection

## 0.4 — Wealth / Investments
Goal: represent investment wealth accurately.

- [x] Investment accounts
- [x] Manual securities (stocks/ETFs)
- [x] ISIN-identified funds, dated manual NAVs and preserved correction history
- [x] Existing holdings, purchases and sales with actual cash settlement
- [x] Reviewed acquisition lots, FIFO/explicit sale allocation and guarded reversal/correction
- [x] Holdings and known/unknown acquisition cost
- [ ] Dedicated dividend/interest activity and fee/tax reporting
- [x] Keyless stock/ETF lookup, cached prices and daily trends
- [x] Explicit saved FX for holding-to-account-currency valuation
- [x] Current portfolio value with missing/stale quote notices
- Realized/unrealized gain/loss
- [x] Investment contribution to net worth

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

- [x] Original-category mapping workspace: grouped transaction review and atomic category-only assignment to existing categories.
