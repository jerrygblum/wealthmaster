# 010 — ISIN-identified funds and dated manual NAVs

Status: Accepted. Extends ADR 009 with the owner's approved manual fund workflow.

## Decision

Add FUND securities with a required, check-digit-validated ISIN and explicit ISO currency. The ISIN identifies one share class per owner. Fund symbol and exchange are represented canonically as ISIN and NAV; no stock ticker or online listing is required. Existing holding, lot, purchase/sale and ownership rules apply unchanged. Adding existing units creates an aggregate opening lot without moving cash.

The marketdata module accepts positive, exact manually entered NAVs with valuation date and optional source reference. Currency comes from the owned fund, not the request. NAV uses NUMERIC(38,12); unsupported precision is rejected. A write requires an owned active investment account with a retained reference to that owned fund. Account and security locks serialize checks with account lifecycle and concurrent NAV submissions. Receipt IDs scoped to owner/security make identical retries safe and reject reused IDs with different input. NAV and audit commit atomically.

V020 extends immutable market_quotes with nav_date (DATE), manual_reference and submission lineage. A manual NAV has no quoted_at Instant: its business date is preserved without inventing a quote time or converting it through a time zone. fetched_at records the actual UTC entry time. The source is explicitly MANUAL_NAV. Automatic quotes retain their existing timestamps and source representation.

The most recent NAV valuation date on or before the business date determines current price. Later entries on the same date are corrections; all earlier entries and audit history remain preserved. Backdated entries add history without displacing newer dates. No future NAV dates are accepted. Fund valuations use units × NAV and existing explicit FX conversion where necessary; cash, units and acquisition lots do not change when recording a price. A shared fund NAV updates all of its owner's account valuations, while archived/future accounts retain the existing net-worth exclusion.

The primary UI provides Add fund by ISIN and Update NAV / history. It shows exact per-unit NAV, business date, source reference, previous distinct dated NAV and its percentage change. A trend uses the latest 30 distinct valuation dates, taking the most recently entered correction per date. The history panel lists the latest 100 entries including corrections; all entries remain in the database. This is NAV/price history, not investment performance or a historical net-worth report. NAVs more than seven calendar days old are marked older, without using the entry time as the valuation date.

## Scope

No finanzen.ch scraping or Swiss Fund Data automation is added until a reliable source is verified. Refresh prices retains manual fund NAVs and may refresh the existing FX feed for a foreign-currency fund. No keys, new dependencies, scheduler, cash transaction or spending category are introduced.
