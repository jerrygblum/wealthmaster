# Investment holdings — implementation plan

Status: Approved and implemented as the first investment release; see ADR 008 and investment operations.

## Confirmed scope

The owner wants to enter existing stock holdings and record subsequent purchases
and sales in each investment account. Brokerage cash is CHF, while stocks may be
traded in USD. Stocks and ETFs share the initial workflow.

Follow ADR 006 for separate cash, securities, trades and acquisition lots, and
ADR 007 for excluding archived accounts from current net worth. The first release
adds explicit cross-currency trade settlement; record the extension to ADR 006
before implementing it. It does not introduce automatic FX conversion or a
multi-currency cash wallet.

## Account workspace

Investment account details gain three views:

- **Holdings:** security, ticker/exchange, quantity, known acquisition cost in CHF,
  average acquisition cost in CHF when complete, and cost-completeness status.
- **Investment activity:** opening holdings, purchases, sales and their lot
  allocations. Expand a security to inspect its remaining acquisition lots.
- **Cash activity:** existing CHF balance, transfers and cash movements linked to
  trades. Trade-linked cash rows open the investment activity for corrections.

Actions: Add existing holding, Record purchase, Record sale. Security selection
reuses the owner's existing security records or explicitly creates a new one.
Search/security-provider integrations are deferred; entry is manual.

The same security can be held in several investment accounts. Each account has
its own quantities, acquisition lots, costs and activity. Tickers alone are not
identities: retain name, stock/ETF type, symbol, exchange, optional ISIN and trade
currency. Review potential duplicate identities rather than merging on ticker.

Archived investment accounts remain readable. Restore them before adding or
correcting investment activity.

## Existing holdings

First confirm that the account's existing opening cash and current cash balance
represent uninvested CHF only. A previously entered whole-portfolio value must be
reconciled before adding holdings or valuations, to avoid counting stocks twice.

Enter a holdings snapshot as of a chosen date, with one opening lot per known
acquisition lot. Inputs:

- Investment account and security.
- Quantity and snapshot date.
- Original acquisition date, when known.
- Original acquisition price/currency and total CHF acquisition cost, when known.
- Notes/source reference and an explicit indication of unknown cost/date data.

Opening holdings create security quantities and lots without a cash movement.
They represent assets already owned at the chosen starting point. If only a total
quantity is available, allow an opening lot marked as an aggregate with incomplete
acquisition history. Unknown cost is nullable and visibly unknown, never zero or
the current market price. Do not present complete cost/performance figures when
some remaining lots have unknown cost.

The snapshot defines the starting point for holdings history. Do not reconstruct
earlier holdings from unknown acquisition dates. It can precede subsequent trades;
validation prevents recording a sale before the relevant holdings exist.

## Purchases and sales with CHF cash and USD stocks

Record the security's execution currency independently from the account cash
currency. A trade records:

- Purchase/sale, security, quantity, execution unit price and trade date.
- Original gross amount in USD, derived exactly from quantity and price.
- Actual CHF cash debit for a purchase or credit for a sale, as booked by the broker.
- Cash booking/settlement date, defaulting to the trade date but independently
  editable when the broker books it later.
- Broker-reported fees and taxes with their currencies, where available; indicate
  that the entered CHF settlement already includes the relevant charges.
- Optional broker reference and notes.

The actual CHF settlement is authoritative for the cash ledger. No market FX rate
is guessed to manufacture it, and no implied exchange rate is inferred by dividing
amounts that may contain fees. Preserve the USD execution data for later reporting.
Fees/taxes remain identifiable components of investment costs; never debit them
again when they are already included in the entered settlement. The initial release
does not add independent dividend or fee/tax reporting workflows.

Purchase: add quantity and a new acquisition lot, and debit CHF cash atomically.
Sale: reduce quantity, record allocations against acquisition lots, and credit CHF
cash atomically. Prevent overselling, including backdated changes that would make
holdings negative on a subsequent activity date. Short selling and margin are out
of scope. Insufficient CHF cash produces a reviewable validation error; do not
invent a deposit, currency conversion or borrowing transaction.

Use FIFO as the proposed default lot-allocation policy, with the exact allocation
shown before confirming a sale. Unknown opening acquisition dates require an
explicitly reviewed lot order/allocation rather than an invented historical order.
Preserve allocation quantities and allocated acquisition costs for future realized
gain calculations. This is an internal tracking policy, not a tax-method claim.

Synthetic example: CHF 1,000 cash, then buy 10 shares at USD 50 each. The broker
books an inclusive CHF 455 debit. Result: 10 shares, CHF 455 acquisition cost and
CHF 545 cash. No ordinary income/expense is created for the purchase principal.

## Financial model and backend boundaries

`investments` owns user-scoped securities, opening position activity, trades,
acquisition lots and sale allocations. Current quantities are derived from opening
activity and effective, non-reversed trades through the requested business date.
There is no independent editable authoritative current-quantity field.

`ledger` remains the cash authority. Add explicit investment purchase/sale cash
operation kinds and link each trade to its cash operation. Existing account views
show these rows; ordinary transaction endpoints cannot independently edit/delete
them. Principal is excluded from income and spending. Ownership, account usage
history and restrictive references cover opening lots as well as trades.

Trade creation, lot allocation, linked cash, permanent history and audits commit
in one transaction. Use a lock order consistent with ledger writers, serialize
concurrent trading against the account/lots, and require optimistic versions and
retry-safe submission identifiers. Repeated submissions must not create duplicate
trades or cash postings.

Corrections/reversals retain audit history. Changes to a purchase/opening lot that
would invalidate dependent sales are blocked with the affected sales identified;
resolve dependencies explicitly. Never silently cascade financial corrections.

Use BigDecimal and NUMERIC. Proposed inputs support up to 12 fractional digits
for quantities and unit prices, with exact gross multiplication. CHF cash postings
respect the existing eight-decimal ledger precision. Define explicit allocation
rounding and residual handling so allocated and remaining costs reconcile exactly.
Reject unsupported precision rather than allowing database rounding. Business
dates use LocalDate; audit timestamps use UTC Instant.

Add Flyway migrations and REST DTOs under `/api/v1/investments` for security
management, account holdings, opening lots, trades and guarded reversals. Keep
controllers thin; financial policy stays in backend services. No new infrastructure
or external dependency is expected.

## Valuation and net worth

This first release tracks ownership and acquisition cost. Acquisition cost is not
current market value. Automatic quotes, FX feeds and portfolio performance remain
a separate step.

The net-worth workspace continues to report cash-only totals, with a prominent
incomplete-valuation indication whenever active accounts have unvalued holdings.
Show that those securities are excluded from the displayed cash-only figure;
never value them at zero or silently substitute acquisition cost. Buying stock
changes cash and holdings, not ordinary spending.

A follow-up can add dated manual quotes and then external price/FX providers.
USD security values and CHF cash remain separate native-currency amounts until
explicit FX support exists. Archived accounts stay excluded from current totals.

## Delivery sequence

1. Agree on this concept, including actual CHF settlement, FIFO review and the
   cash-only net-worth limitation. Update the ADR/product/roadmap accordingly.
2. Add securities, opening holdings/lots, usage-policy integration and account
   holdings UI. Support unknown costs without fabricated values.
3. Add purchases with atomic CHF cash postings, original USD execution data,
   charges, validation, audit and idempotency.
4. Add sales, lot allocation review, chronological oversell validation and guarded
   correction/reversal of dependent activity.
5. Complete account cash/investment navigation, unvalued-holdings warnings,
   documentation, integration tests and desktop/mobile browser journeys.

Acceptance checks cover separate holdings of the same stock in two accounts,
fractional quantities, incomplete opening costs, CHF settlement of USD trades,
fees counted once, purchase/sale principal excluded from spending, exact cash and
lot reconciliation, future/backdated activity, concurrent sales, repeat submissions,
archived accounts, ownership, stale versions and whole-transaction rollback.

Dividend automation, stock splits, security transfers between brokers, shorting,
multi-currency cash wallets, broker imports, live quotes, FX providers and tax
reporting remain outside this implementation.
