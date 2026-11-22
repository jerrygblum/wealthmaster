# 009 — Holdings first, market valuation and separate spending costs

Status: Accepted following the owner's request to simplify investment accounts.
Extends ADR 008; original activities, acquisition lots, allocations and cash links remain intact.

## Decision

Investment account cards and net-worth contributions open a holdings overview. The primary flow is selecting a stock/ETF listing and recording shares already owned. This creates an explicitly aggregate opening lot with unknown acquisition history and no cash movement. Detailed purchases, sales, allocations and corrections remain in a secondary investment-activity workspace. The ledger still owns cash and acquisition lots remain preserved.

Fees and taxes for new activity are entered manually as ordinary spending transactions. New trade cash amounts exclude those separately recorded costs. Existing records whose settlement already included charges retain their original representation; do not create a second spending debit for the same included fees. Purchase/sale principal remains investment activity, never spending or income.

The marketdata module fetches public Yahoo Finance search/chart data without registration. Access is best effort and may be delayed, unavailable or rate limited; no guaranteed real-time feed is claimed. Fixed HTTPS endpoints, bounded payloads, timeouts, no redirect following and server-side requests avoid arbitrary outbound destinations. Only a query/symbol is sent, never account names, quantities, balances or transaction details. No external library or API key is required.

## Valuation

Account value = ledger-derived cash + the sum of quantity × latest available security price × explicit quote-to-account-currency FX. Same-currency holdings use a rate of one. Each position is rounded HALF_UP to eight decimals in account currency, then summed. Financial calculations use BigDecimal/NUMERIC. Source prices are normalized to ISO currencies (GBp to GBP) and source daily price tails explicitly rounded to twelve decimals. SVG coordinates alone may use floating point.

Missing prices or FX leave a position unvalued and visibly excluded; no zero quote or cost-as-market-value substitution is made. Account totals, cards and net worth use the same valuation. Archived and not-yet-open accounts remain excluded from current net worth. Account API currentBalance remains cash for ledger clients; valuation.totalValue supplies the combined account value.

Owner-scoped immutable quote rows retain source, symbol, currency, quote/fetch timestamps and daily series. Linking a different listing preserves earlier source rows and explicitly audits the choice; current valuation uses only the selected listing. Normal account/net-worth reads never contact the provider. Refresh is explicit, reuses successful quotes for fifteen minutes and bounds a refresh to twenty upstream requests. Failures retain last successful prices. Quotes are flagged older when fetched more than a day ago or quoted more than seven days ago. Daily change and month sparklines describe prices, not portfolio returns.

Historical net worth, live streaming, investment performance and automated broker imports remain deferred. Current quote history does not silently become a historical valuation engine.
