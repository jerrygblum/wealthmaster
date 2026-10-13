# Categories

Flyway V006 creates category tables and adds nullable ledger assignment. Existing activity remains Uncategorized; no balance or movement changes. No dependency or environment setting is added. Back up before deployment and deploy backend/frontend together for the extended DTOs.

Categories are isolated by session owner and organized into Income and Spending, with one optional subcategory level. Either level may be selected. Income uses income categories; expenses and refunds share spending categories. Transfers have none. Names are trimmed and unique case-insensitively within type and parent, including archived entries.

Users may explicitly install the editable Swiss expense starter set once into an empty list. It contains 14 spending groups with 60 subcategories from the supplied Swiss expense taxonomy, plus the income categories Salary and Other income (76 categories total). There is no automatic seed. Deleting every starter does not make installation available again.

Archive used categories instead of deleting them. Deletion requires no historical references and no children. Every assigned category and its parent retain references even after recategorization, clearing or deleting entries. Used categories cannot change type/parent; roots with children also lock structure. Names remain editable; current activity uses new names while audit snapshots retain previous labels.

Archiving a parent makes children unavailable without changing their own active flags. Restore the parent to make active children selectable again; independently archived children still require restoration. Retained archived assignments can remain during unrelated edits or be cleared/replaced. New assignments require an active branch. Archived financial accounts remain read-only.

`PUT /transactions/{id}` replaces category assignment: omitted or null `categoryId` clears it. Clients must round-trip assigned IDs to preserve them. Category modifications require CSRF and quoted If-Match versions. Stale forms retain input and require cancellation/reload. Existing MFA and ownership protections apply.

Lifecycle and ledger assignment serialize through a per-owner state row. Audits, references and ledger changes share transactions; no partial starter set or assignment survives rollback. Categorization leaves balances and net worth unchanged. No scheduled jobs or new monitoring configuration is needed; existing health checks and database backups cover the new tables.

Budgeting is deferred. Pre-production V012 removes current spending-limit settings and budget-only category references. Permanent ledger and expectation history, plus existing children, restrict category deletion or structure changes. Ledger and audit history remain intact.

Income and spending categories use consistent compact rows with inline edit/archive/delete actions. Forms edit only category name, type and parent. Stale category versions return 412; failed requests retain input. See [spending operations](spending.md) for period/category reports.

Starter-set updates apply only to future installations. Existing user categories and ledger assignments are preserved; no database migration or automatic categorization runs.

## Original category mapping

The Category mapping workspace (`#/category-mapping`) groups all live income,
expenses and refunds whose descriptions contain the preserved `Original category:`
marker. Income and spending form separate groups even for identical source labels.
Transfers and deleted operations are excluded. Each group exposes exact amounts,
account links, dates, descriptions and current category assignments for review;
transaction tables show 25 rows per page. The workspace hides groups with no
uncategorized transactions, including immediately after a completed mapping.

Users select an existing available category of the matching type. Uncategorized
transactions are selected by default; replacing existing assignments requires an
explicit checkbox and final confirmation. Mapping uses the reviewed ID/version
snapshot only. Later arrivals remain for a subsequent review. A stale transaction
or target rejects the whole request; refresh groups before retrying.

The backend locks all reviewed operations in deterministic UUID order before the
category owner lock. Category-only writes preserve descriptions, source staging,
amounts, dates and ledger movements, and work on archived accounts. They increment
operation versions and record permanent category references and before/after audits.
No schema migration or new runtime configuration is required. Deploy frontend and
backend together. Reclassification increments imported-operation versions, so an
import reversal may require resolving the existing changed-operation guard.
