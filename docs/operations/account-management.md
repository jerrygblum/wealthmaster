# Account management

Flyway V004 adds account versions (existing accounts start at 0) and nullable JSON audit details. It does not rewrite opening balances or remove accounts. Back up the database before production migration using the existing backup procedure; roll forward rather than dropping columns after new audit history has been written.

Active accounts are shown by default. Archived accounts are available through the Archived accounts view and can be restored. Archiving is not deletion and must not exclude balances from future net-worth calculations. Opening balances alone do not block editing or deletion. Cash ledger history permanently locks type, currency and opening amount and prevents deletion, including after moving or soft-deleting entries. Archived activity remains readable; restore all affected accounts before recording or correcting it. See [cash ledger operations](cash-ledger.md). Future import/trade modules must integrate the activity policy and restrictive references documented in ARCHITECTURE.md before release.

Editing and deletion use the account version to prevent overwriting concurrent changes. On a stale edit, cancel to reload accounts before trying again. A stale deletion offers Reload accounts. Permanent deletion retains the final snapshot in audit_events; there is no undelete UI. Archive instead when you want a reversible action.

Audit JSON contains account metadata and financial opening amounts. Treat it as sensitive application data, include it in database backups, and never log it or copy production audit rows into public fixtures. This release does not add an audit browsing UI.

Opening date remains editable after transactions or expectations exist, with ownership, version checks and audit snapshots. All nondeleted transactions through today contribute to balances regardless of opening date. Future-opening accounts still enter net worth only on their opening date. Spending is independent of account opening date.

## Account order and colors

The Accounts page offers move-up/down buttons and a named color palette on each
card. Controls support keyboard and touch. Changes save on the server for the
signed-in owner and survive refreshes and other devices. Account names and types
remain visible so color is supplementary. Archived accounts keep their positions;
reordering a filtered list swaps visible accounts while retaining hidden slots.
New accounts appear first.

Flyway V015 adds display_order and accent, retaining the previous newest-first
order for existing accounts. No financial amounts or ledger movements change.
PUT /api/v1/accounts/order accepts every owned account ID and version in order;
PUT /api/v1/accounts/{id}/appearance accepts a named accent and account If-Match.
Both enforce ownership, versions and CSRF, and audit changes transactionally.
Used and archived accounts remain customizable. A concurrent account change asks
the user to reload; failed requests leave the displayed order/color unchanged.
