# Account management

Flyway V004 adds account versions (existing accounts start at 0) and nullable JSON audit details. It does not rewrite opening balances or remove accounts. Back up the database before production migration using the existing backup procedure; roll forward rather than dropping columns after new audit history has been written.

Active accounts are shown by default. Archived accounts are available through the Archived accounts view and can be restored. Archiving is not deletion and must not exclude balances from future net-worth calculations. Opening balances alone do not block editing or deletion. Cash ledger history permanently locks type, currency and opening amount and prevents deletion, including after moving or soft-deleting entries. Archived activity remains readable; restore all affected accounts before recording or correcting it. See [cash ledger operations](cash-ledger.md). Future import/trade modules must integrate the activity policy and restrictive references documented in ARCHITECTURE.md before release.

Editing and deletion use the account version to prevent overwriting concurrent changes. On a stale edit, cancel to reload accounts before trying again. A stale deletion offers Reload accounts. Permanent deletion retains the final snapshot in audit_events; there is no undelete UI. Archive instead when you want a reversible action.

Audit JSON contains account metadata and financial opening amounts. Treat it as sensitive application data, include it in database backups, and never log it or copy production audit rows into public fixtures. This release does not add an audit browsing UI.

Opening date remains editable after transactions or expectations exist, with ownership, version checks and audit snapshots. All nondeleted transactions through today contribute to balances regardless of opening date. Future-opening accounts still enter net worth only on their opening date. Spending is independent of account opening date.

## Account order and colors

Use **Card settings** for the complete account list and appearance controls; the overview keeps account information and a dedicated View details action visible. Order changes save immediately; appearance changes save per account. Archived accounts are included in the settings list.

Flyway V015 introduced owner-scoped ordering and named accents. V022 extends presentation with arbitrary hex colors and bounded logos while preserving previous accents. `PUT /api/v1/accounts/order` still requires every owned account ID and version. `PUT /api/v1/accounts/{id}/appearance` accepts an accent, optional custom color and optional built-in logo; `PUT /api/v1/accounts/{id}/logo` handles custom images for normal users. Changes require CSRF and quoted If-Match versions, preserve all financial data and commit atomically with audits. Conflicts offer reload; failures keep saved order and appearance unchanged.

## Check cash at a chosen date

The account activity page includes [Balance on date](account-balance.md) alongside current cash and the existing editable activity list. Use it to inspect recorded closing cash or a separate optional expected forecast for today/future dates. Pre-opening dates are unavailable; opening-date corrections and transaction edits recalculate history. Securities are excluded from investment cash balances. No migration or new configuration is required.

## Card settings and logos

Open **Card settings** on Accounts. The modal lists every account, including archived accounts. Move up/down buttons work with keyboard and touch and save the complete order immediately. Appearance changes are drafts: use **Save appearance** for each account. **Done** or Escape discards unsaved appearance changes and returns focus to Card settings. A conflicting version offers Reload accounts; reload discards drafts and reads current server versions.

Choose a color using the native picker or a six-digit hex value. Reset color restores the default. Colors shade the whole card with a light tint so balances remain readable. Legacy named colors continue to work. Choose an account-type icon, one of the bundled bank identification marks (UBS, PostFinance, Raiffeisen, ZKB or Revolut), or a custom image. Bundled marks are local stylized identification badges, not externally downloaded official logo artwork. Images never load from a bank or third-party tracking service. Missing/broken images fall back to the account-type icon. Each overview card has a dedicated View details button; investment details open holdings and other accounts open cash activity.

Normal authenticated users can choose a local PNG, JPEG or WebP image up to 2 MB and 4096 × 4096 pixels. The browser fits it into a 128 × 128 PNG, preserving proportions and stripping source metadata. Detailed images that exceed the 32 KiB normalized limit are rejected with guidance. The server independently accepts only valid PNG data up to 32 KiB and 256 × 256 pixels and re-encodes it; SVG, arbitrary URLs and malformed data are rejected. Saved image bytes are private account data stored in PostgreSQL and covered by normal backups; audit events retain presentation metadata without image bytes. Replacing/removing an image does not retain old image files.

Public demo users may reorder accounts, choose colors and select built-in marks. Custom uploads are hidden and their separate API endpoint is denied server-side. Deploy rebuilt backend/frontend together; Flyway applies additive V022 automatically and preserves existing order, accents and financial data. No volume changes or data reset are needed.
