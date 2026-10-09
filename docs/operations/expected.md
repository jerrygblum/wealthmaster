# Expected monthly activity

Deploy frontend/backend together. Flyway V013 adds definitions, sparse reconciliation state, permanent account/category references and owner-matching foreign keys. Existing ledger, categories and balances are unchanged. Back up before deployment; restore the complete database, including expected tables and audit events.

The Expected page manages fixed monthly income, expenses and same-currency transfers. Expectations affect no balances until reviewed actual activity is saved. No new dependency, environment variable, worker, scheduler or monitoring configuration is required. Standard health checks and backups cover this feature.

Edits apply to all months. Confirmed links and skips survive; links outside a revised schedule remain visible for review. Set a last month to stop recurrence while retaining earlier months. Deleting a definition removes it from views and releases operation links; audit snapshots and permanent references remain. Referenced accounts cannot be deleted or have financial setup changed, and referenced categories/parents cannot be deleted or restructured. Archive/restore remains available.

Suggestions stay in the same calendar month, matching type, currency and accounts, with exact amounts first. They require user confirmation. Deleted or incompatible linked ledger operations need review; amount differences are allowed. Recording actual activity and its link is atomic. Skip/undo affects one month. Future months can be recorded; unavailable references must be restored first. Future-dated links show Scheduled and stay outstanding until their transaction date, when they become Completed automatically on read.

CRUD requires CSRF and quoted definition If-Match. Occurrence mutations require quoted occurrence If-Match, definitionVersion, and operationVersion for links. Stale forms retain input and require reload. Reports/candidates disable caching and use a single repeatable-read snapshot. Tests use synthetic disposable databases; never run fixtures against application data.

Overdue and historical occurrences can be recorded even when their month precedes account opening. Actual dates may be in any month: use January for a January purchase entered in March, or March for a January expectation paid late. The occurrence stays in January; spending follows the actual transaction date. Explicit confirmations also allow cross-month dates; automatic suggestions stay same-month. Correcting a date preserves the link. Entries before account opening contribute to both historical spending and current balances/net worth.
