# Account management

Flyway V004 adds account versions (existing accounts start at 0) and nullable JSON audit details. It does not rewrite opening balances or remove accounts. Back up the database before production migration using the existing backup procedure; roll forward rather than dropping columns after new audit history has been written.

Active accounts are shown by default. Archived accounts are available through the Archived accounts view and can be restored. Archiving is not deletion and must not exclude balances from future net-worth calculations. Opening balances alone do not block editing or deletion. Cash ledger history permanently locks financial setup and prevents deletion, including after moving or soft-deleting entries. Archived activity remains readable; restore all affected accounts before recording or correcting it. See [cash ledger operations](cash-ledger.md). Future import/trade modules must integrate the activity policy and restrictive references documented in ARCHITECTURE.md before release.

Editing and deletion use the account version to prevent overwriting concurrent changes. On a stale edit, cancel to reload accounts before trying again. A stale deletion offers Reload accounts. Permanent deletion retains the final snapshot in audit_events; there is no undelete UI. Archive instead when you want a reversible action.

Audit JSON contains account metadata and financial opening amounts. Treat it as sensitive application data, include it in database backups, and never log it or copy production audit rows into public fixtures. This release does not add an audit browsing UI.
