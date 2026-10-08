# Budgeting deferred

Budget functionality has been removed in favor of [spending by category and period](spending.md). Pre-production Flyway V012 permanently drops current limit settings and their category references. Earlier cleanup migrations remain unchanged. Categories, transactions, ledger history, currency preferences and audit records are preserved.

GET/PUT /api/v1/budget-settings and all /api/v1/budgets routes are retired. Category requests no longer accept normalLimit; spending reports no longer return limits or unbudgeted totals. Currency preferences no longer expose hasLimitsToReset or accept confirmLimitReset.
