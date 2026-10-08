# Spending by category and period

Spending uses #/spending; #/planning remains an alias. Net worth remains the default landing page. Select a month or year, enter a period, or use previous/next controls. The default is the current business month in APP_BUSINESS_TIME_ZONE (Europe/Zurich by default).

Each native currency has expense, refund and net totals and a compact category table. Main-category amounts are inclusive; expanded directly assigned and child rows are breakdowns, not additional spending. Uncategorized activity is separate. Refund-only periods remain visible, and refunds may exceed purchases. Display values use two decimals; API amounts and calculations remain exact.

GET /api/v1/spending and /spending/activity are owner-scoped, no-store repeatable-read snapshots. Activity includes archived accounts/categories and excludes deleted operations, income, transfers and opening balances. Completed periods include the full period; current periods include activity through the business date; future periods have no activity. Supporting activity includes immediate children, or uncategorized activity when categoryId is omitted, with 50-row ledger ordering and account links.

Flyway V012 removes current budget settings and their references at backend startup. This pre-production cleanup permanently deletes limit data; take a backup before upgrading if those settings must be retained externally. It preserves ledger, categories, user preferences and audit history. Restoring an older backup and starting the updated backend reapplies pending migrations. Budget-only history no longer restricts categories; permanent ledger history still does.

Default currency remains an explicit, versioned and audited preference. Changing it needs no budget confirmation and leaves spending and transaction currencies unchanged. No FX conversion, chart, cache or scheduled job is introduced.
