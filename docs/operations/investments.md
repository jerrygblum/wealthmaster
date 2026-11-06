# Investment holdings

Current entry point: the holdings overview, stock/ETF market valuation and manual fund NAV workflows described below (V019–V020). The earlier detailed activity model remains available in Manage investment activity; its original inclusive-charge behavior is retained for historical corrections. New fees/taxes are recorded separately as spending.

Open an investment account to see its holdings and account value. Choose **Manage investment activity** for opening lots, purchases, sales and corrections, or **Cash activity / record costs** for cash movements and separately recorded fees/taxes. Account opening balance is uninvested cash only. If an existing balance includes securities, reconcile it before confirming an opening holding or trade. Activity is entered manually; stock/ETF quotes refresh on request and funds use dated manual NAVs. Broker imports and guaranteed live prices remain deferred.

Create a stock/ETF with its listing name, symbol, exchange and ISO currency; optionally retain its ISIN. Online lookup can create a selected stock/ETF listing, while **Add fund by ISIN** creates a fund without a market ticker. Securities are private to the signed-in owner and can be reused across their investment accounts.

## Existing holdings

Use **Add existing holding** to enter a quantity effective on a snapshot date. Enter original acquisition date, unit price and total acquisition cost in the account cash currency when known. Blank date/cost remain unknown. Use a separate opening entry per known historical lot; mark an aggregate when only a combined quantity is available. An opening entry changes shares without changing cash.

## Purchases and sales

Enter quantity and execution price in security currency, trade date, cash date and trade cash amount in account currency. For CHF cash buying USD stock, retain the USD execution price and the actual CHF principal. For new purchases/sales, record fees and taxes separately as spending and exclude those costs from the trade cash amount so the combined entries reconcile to the broker's actual debit or credit. No settlement FX conversion is guessed. Historical inclusive-settlement records and their explicit-currency charge components remain preserved for corrections; do not also record those included charges as spending.

Build and review the preview, including cash movement and warnings, then explicitly confirm. Sales propose FIFO by acquisition date, with warnings for unknown dates. Edit per-lot quantities, then rebuild the preview before confirming; all selected quantities must total the sale quantity. Future sales reserve their allocated shares. Changes in cash or activity require a fresh preview. A retried identical submission returns its original receipt.

Holdings show remaining quantity, known acquisition cost, cost completeness and remaining lots. Average cost appears only when all remaining cost is known. Amounts and quantities use exact decimal strings; quantities/prices allow twelve fractional digits, settlement/cost eight. Partial allocations round cost to eight digits; consuming the final shares takes the exact remaining cost.

## Corrections and safeguards

Cash activity links back to the investment record. Correct it through Investment activity: review a reversal, then optionally enter a replacement. Reversal and replacement are separate explicit commits; cancelling the replacement leaves the original reversed. Dependent sales must be reversed first. Shares may never become negative; purchases and sale reversals must retain sufficient cash through later recorded cash movements. Original activities, lots, allocations and audit records remain preserved. Archived accounts retain readable history and cannot accept changes.

Trade principal does not count as income or spending. Current account values and net worth include cash plus holdings valued with saved stock/ETF quotes or manual fund NAVs and explicit FX where required. Missing prices/FX leave positions excluded and totals visibly incomplete; older quotes/NAVs are marked. Acquisition cost never substitutes for market value. Realized/unrealized gains, dedicated dividend/interest activity, fee/tax reporting, portfolio performance, corporate actions and immutable historical snapshots remain deferred. [Net-worth trends](net-worth-trends.md) reconstructs historical values using dated saved observations, with gaps where price/FX history is missing.

## Deployment and verification

Deploy both images together using the normal backup/update process. Flyway applies pending migrations through V020 automatically; Hibernate does not alter schemas. Full PostgreSQL backups must include investment activity, lots, allocations, stock/ETF and FX quotes, manual fund NAVs/corrections and audit history. The pre-release backup is required for a whole-database rollback; do not revert the application image across this migration without restoring the matching database. No new environment variables or dependencies are needed.

Integration tests exercise owner/MFA/CSRF enforcement, atomic audit/cash writes, exact fractional cost allocation, actual cross-currency settlement, chronological guards, stale previews, concurrent submissions and reversals. Browser journeys cover opening holdings, purchases, edited sale allocations, cash links, net-worth warnings and guarded corrections on desktop and mobile. All browser data is synthetic and isolated from normal local and NAS data.

## Holdings overview and market prices (V019)

Investment accounts now open on their holdings. **Add holding** lets you search for a stock/ETF by name or ticker, explicitly select its exchange/listing, and record the shares already owned. You may select an existing manually created security instead. Shares are added to the current position; this is an opening entry, not a purchase, and cash stays unchanged. Use **Manage investment activity** for purchases, sales or corrections. Existing records and acquisition lots are preserved.

Use **Link online listing** for existing manually entered holdings. Choose the actual listing: symbols can represent different instruments on different exchanges. Its type and ISO currency must match the retained security. Changing the listing is audited and preserves older quote rows. Searching alone creates nothing; choosing a result explicitly creates/reuses the owner's security listing.

**Refresh prices** fetches the latest regular-market quote, previous daily close, recent daily price history and required FX quotes from Yahoo Finance without an account or API key. Prices can be delayed and access is best effort. Only symbols/search queries leave the backend. The browser receives no provider credentials. Cached successful quotes are reused for fifteen minutes; normal page loads and net-worth reads use saved quotes and never call the source. A refresh can make up to twenty upstream requests; repeat later for additional holdings. Source failures retain saved prices and report which positions could not be refreshed. Quotes older than a day since fetch or seven days since the source timestamp are visibly marked older.

The overview, account cards and net worth now include priced holdings in the account currency: for example 2.5 shares × USD 100 × USD/CHF 0.9 = CHF 225, plus cash. Missing prices/FX produce an incomplete total and a count of excluded positions. Quote and FX timestamps are shown per holding. The daily-change percentage compares the latest quote to the previous daily close; the sparkline shows roughly one month of daily prices, not investment performance. Acquisition cost is never used as market value.

For new purchases/sales, record the cash principal in Investment activity. Record fees and taxes separately through **Cash activity / record costs** as spending, excluding these separately entered costs from trade cash. Older inclusive-settlement records and charge metadata remain supported for corrections; do not duplicate their already included charges as spending.

V019 adds market-symbol links and private quote history. No API key or additional environment variable is needed. The backend needs outbound HTTPS to query1.finance.yahoo.com; offline operation retains holdings/cash and saved quotes. Deploy both images together, include quote history in normal full PostgreSQL backups, and preserve the pre-update backup for rollback. Automatic quote schedules and guaranteed real-time feeds remain deferred. Net-worth trends uses these saved observations for historical reconstruction; quote coverage is limited to the data already retained.

## Fund holdings and manual NAV (V020)

Use **Add fund by ISIN** in an investment account. Enter the fund name, the share class's ISIN and its NAV currency. The ISIN's format and check digit are validated; duplicate fund ISINs are rejected for the same owner. Fund identity uses ISIN rather than a required market ticker. After creating it, enter **Units to add** and **Held as of**, then **Save holding**. This records units already owned and leaves cash unchanged. Existing funds can be selected through Add holding and reused across the owner's accounts.

Choose **Update NAV / history** beside a fund. Enter its published positive NAV per unit, valuation date and optional source reference, such as the publisher/page you consulted. Currency follows the fund. The NAV date starts blank so you explicitly enter the published valuation date rather than assuming it is today. The date must be on or before the app's business date. Up to twelve fractional digits are retained exactly; unsupported precision is rejected. A NAV update affects this fund's value in all your investment accounts, without changing units, cash, ledger activity or acquisition lots.

Current value uses the newest dated NAV, with explicit saved FX if its currency differs from the account. A backdated NAV adds history without replacing a more recent valuation. For a correction, save another entry on the same valuation date; its later entry time makes it that date's current NAV. Earlier entries remain readable and audited. Identical retried submissions return the original receipt. Archived accounts allow history review but cannot record NAVs; an active account holding the same fund may update its shared price.

Fund rows display Manual NAV, the valuation date, optional source reference, prior distinct dated NAV and change since that NAV. The trend uses the latest 30 distinct valuation dates, while the history panel lists the latest 100 entries including corrections. Every entry remains in PostgreSQL. Date-only NAV fields remain DATE/LocalDate and are displayed without timezone conversion; recorded times remain UTC Instants. NAVs older than seven calendar days are visibly marked older. Missing NAV or required FX leaves the position unvalued and the account/net-worth total incomplete.

**Refresh prices** does not replace manual fund NAVs with stock prices. It can refresh FX for foreign-currency funds. No online fund-price integration or API key is required. The manual workflow works offline for same-currency funds. Deploy both images normally: Flyway applies V020, and full database backups include manual NAVs, corrections and audit history. No configuration changes are needed.
