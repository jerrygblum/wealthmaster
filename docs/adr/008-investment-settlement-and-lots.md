# 008 — Investment holdings and explicit cash settlement

Status: Accepted for the first investment implementation. [ADR 009](009-holdings-first-market-valuation.md) adds the holdings-first UI, quote-based valuation and separately recorded spending costs. Extends ADR 006's initial
single-currency trade boundary without introducing multi-currency cash wallets.

## Decision

A security listing has an owner, symbol, exchange, stock/ETF type, optional ISIN and
execution currency. An investment account retains one cash currency. Purchases
and sales preserve exact native quantity/price/gross and separately record the
actual inclusive settlement in the account cash currency. CHF cash can therefore
settle USD stock trades without guessing FX. Charges retain currencies and remain
included components, never additional debits.

Opening lots create ownership without cash. Unknown cost/date data stays nullable
and visible. BUY/SELL cash postings have dedicated ledger kinds and immutable
links to investment activity; ordinary ledger endpoints cannot edit/reclassify
those postings. Investment activity, lot allocations, cash and audit commit
atomically. Submission IDs are owner-scoped and payload-checked for safe retries.

Holdings are derived from active activity through the business date. Sales use
reviewable FIFO proposals or explicit lot selections; unknown opening dates are
flagged. Future sale allocations reserve their shares. Backdated sales cannot
consume already reserved lots or create negative positions. Account locks
serialize trading; linked operation locks precede account locks for reversals.

Quantities/prices use NUMERIC(28,12), gross uses NUMERIC(56,24), and account cash
and acquisition cost retain NUMERIC(28,8). Partial-lot cash cost uses HALF_UP to
eight decimals on the remaining cost/quantity; consuming the final shares takes
the entire residual. Original lot cost reconciles exactly to sold plus remaining
cost. Average cost is a derived rounded presentation value, not a stored source.

Corrections use an audited reversal and replacement. Purchases/openings with
active dependent sales cannot be reversed. Reversing sale proceeds cannot make
booked cash negative. Referenced accounts and securities retain restrictive
history even after reversal. Archived accounts are read-only and excluded from
current net worth under ADR 007.

## Valuation

Acquisition cost is not market value. The first release adds no market prices or
FX feed. Current net worth includes cash only and exposes a prominent warning and
count for unvalued active security positions. Trade date controls shares; cash
booking date independently controls cash. Quotes, realized gains, corporate
actions and multi-currency cash positions remain follow-up work.
