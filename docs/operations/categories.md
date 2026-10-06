# Categories

Flyway V006 creates category tables and adds nullable ledger assignment. Existing activity remains Uncategorized; no balance or movement changes. No dependency or environment setting is added. Back up before deployment and deploy backend/frontend together for the extended DTOs.

Categories are isolated by session owner and organized into Income and Spending, with one optional subcategory level. Either level may be selected. Income uses income categories; expenses and refunds share spending categories. Transfers have none. Names are trimmed and unique case-insensitively within type and parent, including archived entries.

Users may explicitly install the common editable starter set once into an empty list. There is no automatic seed. Deleting every starter does not make installation available again.

Archive used categories instead of deleting them. Deletion requires no historical references and no children. Every assigned category and its parent retain references even after recategorization, clearing or deleting entries. Used categories cannot change type/parent; roots with children also lock structure. Names remain editable; current activity uses new names while audit snapshots retain previous labels.

Archiving a parent makes children unavailable without changing their own active flags. Restore the parent to make active children selectable again; independently archived children still require restoration. Retained archived assignments can remain during unrelated edits or be cleared/replaced. New assignments require an active branch. Archived financial accounts remain read-only.

`PUT /transactions/{id}` replaces category assignment: omitted or null `categoryId` clears it. Clients must round-trip assigned IDs to preserve them. Category modifications require CSRF and quoted If-Match versions. Stale forms retain input and require cancellation/reload. Existing MFA and ownership protections apply.

Lifecycle and ledger assignment serialize through a per-owner state row. Audits, references and ledger changes share transactions; no partial starter set or assignment survives rollback. Categorization leaves balances and net worth unchanged. No scheduled jobs or new monitoring configuration is needed; existing health checks and database backups cover the new tables.

Current category-limit use retains the main category permanently in budget_setting_category_history. Selecting No limit does not unlock deletion or type/parent changes. Pre-production V010 removes subcategory limits and V011 removes period overrides and dated revisions; ledger history and current-setting references remain. See [spending limits](budgets.md).

Compact spending-category rows show linked monthly/yearly allowances. Main-category Create/Edit uses No limit / Monthly / Yearly, one amount in the default currency, and a calculated counterpart. Changing display units preserves the canonical source until the amount is edited. Subcategories have no limit controls and count toward the main category. Edit/archive/delete actions remain inline; income management is unchanged. Limits load independently so failures leave category details manageable. Spending’s Manage limit link selects the main category and opens the archived view when needed.
