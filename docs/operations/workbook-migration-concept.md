# Guided legacy workbook migration — concept

Status: implemented in V016, with stale-draft cleanup in V017, and available at `#/imports`. Scope is a manually
reviewed migration of the supplied legacy workbook. Future bank/credit-card
statement uploads, PDF parsing, FX conversion, investments and automatic learning
are outside this slice. This does not change the financial invariants.

## Source semantics

The inspected workbook has a title row, a header row and a transaction sheet with
these columns:

| Column | Meaning / proposed treatment |
| --- | --- |
| Date | Date money moved from/to the bank account, confirmed by the user. Preserve as the ledger transaction date. It is not the purchase date. |
| Context | Formula-derived past/current/future label. Preserve as source data; do not use to classify transactions. |
| Type | Income, Expense, Transfer -, Transfer +, plus a structural end marker. Map explicitly. |
| Account | Ordinary account for direct activity; paying bank account for confirmed card activity. |
| Description | Source description; review fallback when empty. |
| Amount | Income/expense price or transfer amount. A negative expense is a refund, confirmed by the user. Normalize signs by confirmed type rules. |
| Balance Amount | Formula-derived signed movement, not an account balance. Use as a consistency check, not an opening or closing balance. |
| Category 1 | Legacy category label requiring an approved mapping. |
| Credit card | Values containing `visa` (case-insensitive) identify card transactions. Each distinct Visa label is mapped to its corresponding card account; other values are retained as comments. Two distinct Visa accounts remain distinguishable. |
| Credit card transaction text | Description for a Visa transaction. The ordinary Description column remains the fallback when this field is blank. |

Some incoming transfer rows reference their outgoing partner with formulas. There
are also formula-only/template rows, zero-valued entries and an end marker.
Parsing must distinguish these from actual activity and show exclusion reasons.

There are no separate card-account transactions or card-bill repayment records in
the legacy workflow. The account field records where the expense was ultimately
paid. Historical purchase dates and outstanding card debt cannot be recovered
from these rows alone. Do not infer either from transaction text.

## Guided workflow

### 1. Stage the workbook and choose the migration period

Upload the file, select the sheet and confirm header/data boundaries and the
included date range. Show candidate, template, marker, zero and invalid row counts.
Do not silently discard rows. Excluding a zero or malformed row requires a recorded
reason; a zero amount cannot become a ledger transaction.

Read XLSM as spreadsheet data without executing macros or external links. Preserve
raw values, formulas and their cached results separately. Read numeric XML values
into exact decimals and respect the workbook's Excel date system. Missing/error
formula results block affected rows. Cached results may be stale: require the user
to save a recalculated copy in Excel when necessary, then review derived values.
Do not run a general Excel formula engine. Retain an immutable source file privately.

Choose a baseline immediately before the included activity. Explain that omitting
later months prevents these data alone from establishing today's actual balances.

### 2. Map accounts and establish opening balances

Show each distinct legacy account with its affected rows. For each, choose an
existing owned account, explicitly propose a new account, or exclude its rows.
Confirm account type and ISO currency; the workbook has no currency column.
Source amounts must be confirmed as booked amounts in that currency. A default
currency preference is not evidence of source currency.

New accounts require an explicit creation choice and review of name, type,
currency, opening date and opening balance. Mapping a label never creates an
account. Several source aliases may map to one account only after confirmation.
Archived accounts require explicit restoration before receiving imported activity.

Opening balances represent the position before the selected activity, including
credit-card debt as negative. Never use a current balance as the opening balance
for historical transactions. Existing account activity must be checked for overlap;
do not overwrite a used account's opening balance. If its baseline is incompatible,
stop and resolve the migration range or choose another explicitly approved target.
Even a zero opening balance must be a reviewed choice.

### 3. Resolve card identities and comments

For each distinct Visa value in the Credit card column, show representative affected
rows and offer:

- Map to an existing card account.
- Explicitly propose a new card account.
- Resolve rows individually if the same Visa label is found to have multiple meanings.

Values without `visa` are treated as comments and the row uses its ordinary account.
Never merge the two Visa accounts based on similar names. Record the mapping and any
override separately from original data.
Resolve all included rows before commit; ambiguous rows can remain excluded with
a reason and be handled in a subsequent batch.

### 4. Map categories

Default all income, expense and refund rows to Uncategorized. Append the original
workbook category to the editable description as `Original category: <label>`;
keep original source cells unchanged. Categorization will be handled later.
Existing drafts have a bulk action to clear category mappings and proposals while
preserving the source labels in their descriptions. Manual category overrides
remain available. No category is created automatically.

The app supports two category levels. Users choose the destination structure;
do not infer parents from punctuation. Refunds use spending categories. Transfers
have no category, regardless of any source label; retain that label in provenance.
Unused legacy labels do not create categories. Archived branches must be restored
explicitly or mapped elsewhere before new assignment.

### 5. Review ordinary activity and transfers

Confirm type/sign rules and show the resulting account movements:

| Source | Proposed ledger operation |
| --- | --- |
| Positive Income | Income on the mapped ordinary account |
| Positive Expense without confirmed card | Expense on the mapped ordinary account |
| Negative Expense without confirmed card | Refund with positive magnitude on that account |
| Transfer - plus matching Transfer + | One transfer, with a negative source and positive destination movement |
| Zero, negative income or conflicting fields | Explicit review; no default financial interpretation |

Use formula references or unique reciprocal date/amount matches as evidence for
transfer pairing; leave repeated/ambiguous matches for manual review. Validate ownership,
distinct accounts, equal magnitude, opposite movement signs, currency and dates.
Keep both source rows linked to one operation. Date/amount matches without a
formula link are suggestions requiring confirmation. Never import the two sides
as independent income and expense. Unmatched, different-date, cross-currency or
unequal pairs require manual resolution; do not invent fees or FX. Source dates
must not be silently changed to satisfy the current single-date transfer model.

Empty descriptions need a user-approved fallback, such as a consistent legacy
transaction label. Negative values become positive magnitudes only after the
operation's meaning has been resolved.

### 6. Reconstruct credit-card settlements explicitly

For each confirmed card purchase, create an expense on the mapped credit-card
account. For a negative expense, create a refund on that card. Preserve the workbook
date as the recorded settlement-date transaction date; no purchase date is invented.
Explain this date basis in the preview and migration summary.

These operations must not also create direct bank expenses. Instead, propose
reconstructed settlement transfers, grouped by:

`calendar month + paying bank account + credit-card account + currency`

The settlement amount is the sum of purchase amounts minus refunds in that group.
The reconstructed transfer uses the latest booked source date in that monthly group:

- Positive net: transfer from bank to card.
- Negative net: transfer from card to bank, representing the recorded net credit.
- Zero net: no settlement transfer; preserve the purchases/refunds.

The grouping represents the legacy workbook's bank movements. It is not proof of
a real statement payment or billing cycle. Mark these transfers as reconstructed
from the legacy workflow and show all contributing rows. Require explicit approval
of the settlement table, including direction, date, accounts and amount. A user
may regroup or correct the plan when they have better evidence; changes must still
reconcile to the source or carry a visible explained difference.

Synthetic example: a CHF 100 purchase and CHF 20 refund on the same settlement
date produce an expense of 100 and refund of 20 on the card, plus one bank-to-card
transfer of 80. Bank movement is -80, net spending is 80 and the card's net movement
for these settled rows is zero. The payment is excluded from spending.

Reject overlaps with confirmed transfer pairs or existing ledger repayments to
avoid creating a second settlement. Different card/bank currencies require manual
resolution and remain outside this slice. An approved zero card opening balance
plus reconstructed settlements describes already-settled activity; it does not
reconstruct historical outstanding debt or current unbilled purchases.

### 7. Reconcile and approve the plan

Present a reviewable, saveable draft containing:

- Account and category mapping tables, row overrides and proposed creations.
- An editable ledger-shaped table, grouped by source account, with date, kind,
  account, destination/card, category, amount, description, inclusion and reason.
- Separate tables for account transactions (signed balance movements) and transfers
  to be created. Group transactions by mapped account and transfers by source and
  destination. Show each paired transfer once with a positive transferred amount
  and both original source row numbers. Reconstructed monthly card settlements
  share the transfer table and remain visible independently of transaction pagination.
- Included/excluded rows with reasons and all unresolved/duplicate candidates.
- Opening balances, net movements and projected ending balances per account/currency.
- Income, expenses and refunds separately; transfers excluded from spending.
- Workbook signed movements compared with the final net movements on each paying
  bank account, so rerouting purchases through cards cannot silently change cash.

Ask the user to supply trusted closing balances at a chosen date. Compare them
with opening balance plus ledger movements, including existing activity once.
Block unexplained differences when a closing balance is supplied. Never create
a balancing adjustment automatically. If no independent closing balance exists,
show that reconciliation is unverified and require explicit acknowledgement.
Source movement agreement alone is not proof the workbook is complete.

Detect repeated uploads by file hash within the owner, and duplicate candidates
against staged/existing operations using dates, accounts, currency and amount.
Show possible matches; let the user keep both, exclude an imported row, or link it
to an existing compatible operation. A prior committed source-to-operation link
prevents accidental re-creation. Never remove uncertain duplicates automatically.
Deleting an uncommitted draft removes its retained source hash and saved-draft entry,
so the same file can be uploaded again. Purged legacy drafts are hidden and replaced
if their file is uploaded again.

Approve one final plan listing every account/category creation and reconstructed
transfer. Confirmation applies only to that version of the plan. Any changed
mapping, amount, creation or settlement invalidates approval and refreshes preview.

### 8. Commit and support reversal

Until final approval, uploads, mappings and proposals remain staged. Account and
category proposals do not create business entities. Commit revalidates resource
ownership, versions, availability, baseline assumptions and duplicate decisions.
Create approved entities and ledger operations atomically through their application
services, with import lineage and audit events. A failed commit leaves no partial
accounts, categories or transactions. Retry with the same commit token cannot
duplicate a batch.

Provide a batch receipt and an Undo preview. Reversal soft-deletes only operations
created by the batch, treating transfers as indivisible operations and preserving
source/audit history. Linked pre-existing operations are untouched. If imported
operations were edited or linked to expectations, block automatic undo and show
the dependencies for manual resolution. Created accounts/categories remain
reviewable; permanent history may prevent deletion, so offer archive where needed.
Reversal is not a promise to erase all traces of the migration.

## Implementation outline

Use a workbook-specific adapter within the existing imports module, feeding the
generic staging/review/commit pipeline. No generalized bank statement framework,
background queue or classifier is necessary for this migration.

Proposed persisted records: owner-scoped import batch and private source metadata;
immutable source rows with sheet/row/cell provenance; versioned mapping/override
decisions; normalized operation proposals; proposal-to-source links supporting
multiple rows per transfer and one row contributing to purchase and settlement;
approval/commit state and links to created/existing ledger operations. Save and
resume drafts. Store reconstructed settlement provenance explicitly.

The backend owns normalization and accounting rules. The UI guides decisions and
renders previews. Never log workbook rows or put the source workbook, account names,
real descriptions or derived private fixtures in the public repository. All
automated tests use synthetic workbooks with the same structure. Private files,
staged rows and mappings need ownership checks and a documented retention/deletion
policy; source retrieval must require authorization.

Suggested implementation order:

1. Read-only workbook staging, column mapping and source diagnostics.
2. Account/card/category mapping with proposed creations and row overrides.
3. Transfer pairing and explicit card-settlement reconstruction.
4. Reconciliation, duplicate review and final approval.
5. Atomic commit, resumability, receipt and guarded reversal.

Acceptance tests must cover ambiguous Visa mappings, comment-only card fields,
negative-expense refunds, zero/template rows, formula cache failures, dates,
currencies, paired transfers, net-negative/zero card settlements, approved entity
creation, independent balance checks, duplicate retries, cross-user isolation,
concurrent account/category changes, commit rollback and guarded undo.

## Decisions needed before implementation

- Approve settlement-date expenses/refunds plus explicitly approved reconstructed
  card transfers as the representation of the legacy workflow.
- Choose the migration period and supply/confirm opening balances, especially any
  card debt carried into that period. Supply closing balances where available.
- Resolve indistinguishable Visa rows using manual selection or additional private
  evidence. Missing evidence cannot be replaced by a confident guess.

Specific account/category choices belong to the private migration draft, not this
public design document.

### Excel numeric precision

Numeric amount and signed movement cells are interpreted using BigDecimal. Trailing
zeros and scientific notation are normalized without changing source cells. Tiny
Excel arithmetic tails within 0.0000000001 of an eight-decimal value are rounded
HALF_UP and disclosed in preview warnings. Nonzero amounts are never rounded to
zero. Larger precision differences and manually edited values still require an
explicit correction. Existing drafts can rebuild previews without reuploading.
