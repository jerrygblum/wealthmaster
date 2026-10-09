# 006 — Investment cash and holdings

Status: Accepted design; transfer/trade implementation deferred.

## Context

A brokerage account contains uninvested cash and security holdings. The common account opening balance cannot represent both without obscuring purchases and valuation. Users need to transfer money to a brokerage, then record quantity and execution price for each purchase.

## Decision

Keep shared identity, ownership, lifecycle, currency, and opening cash in `accounts`. Type-specific behavior belongs to application/domain services; do not use a wide account table with nullable stock fields or JPA subtype hierarchies. Add investment-specific account configuration only when actual fields are needed.

`ledger` owns cash movements and linked transfers. A transfer between owned accounts posts both movements atomically and has no income/spending effect. Initially, each account has one cash currency. Future multi-currency brokerage support must introduce explicit cash positions per currency rather than overwriting the account currency or converting source amounts away.

`investments` owns securities, trades, acquisition lots, and derived positions. A purchase records investment account, security identity, business date, quantity, unit price, trade currency, fees, and taxes. Tickers alone are not globally unique; retain exchange/identifier information as available. Amounts, prices, and fractional quantities use BigDecimal/NUMERIC with sufficient precision; exact precision and rounding rules must be settled with the trade API, with no silent persistence rounding.

A trade application service creates the trade, acquisition lot, and linked ledger cash movement within one PostgreSQL transaction. Gross cost is quantity × execution price; cash debit includes fees and taxes. Cash postings are classified as investment activity, not ordinary expenses; fees/taxes retain separate components for cost reporting without double counting. A later sale reduces holdings through recorded lot allocations and credits cash. Each purchase retains its lot even when the UI shows an average acquisition price.

Cash balance = opening cash + cash ledger movements. Holdings are derived from investment activity, not a mutable share-count field. Portfolio value = cash + holdings valued at relevant market prices; acquisition cost is not current market value. Missing market prices/FX must be surfaced rather than silently equating cost to value. `marketdata` owns prices/FX and timestamps; `networth` combines cash, holdings, and liabilities exactly once. Archived accounts remain part of valuation and history.

For existing holdings at migration time, a future opening-position/import workflow must preserve quantity, acquisition lots, and source lineage without inventing a new cash purchase. The opening account balance continues to mean cash only.

## Example

Transfer CHF 1,000 from checking to brokerage: checking cash −1,000; brokerage cash +1,000. Buy five shares at CHF 100: create a five-share acquisition lot costing CHF 500 and post brokerage cash −500. With no fees, brokerage now contains CHF 500 cash and five shares. At a later quote of CHF 110 per share, its value is CHF 1,050. The transfer and purchase are not spending.

## Integration requirements

All trade/transfer operations authorize every referenced account for the signed-in user, require active accounts, and lock accounts in UUID order. Ledger, imports, and investments contribute to AccountUsagePolicy before persisting references. Their restrictive foreign keys prevent permanent account deletion; history checks also lock type/currency/opening fields after any activity, including reversed transactions and retained import references. Cancelling or reversing activity does not make an account unused again. Corrections must be auditable and imported source data immutable.

## Consequences and sequence

This release changes account management and clarifies opening cash in the UI, without new investment tables or APIs. Next implement ledger cash activity and same-currency transfers; then securities, purchases, cash linkage, and lots; then sales/allocations and market valuation. Cross-currency trading requires explicit FX and cash positions in a later slice. No direct broker integration or market-data provider is selected here.
