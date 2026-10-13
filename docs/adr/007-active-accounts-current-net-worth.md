# 007 — Active accounts in current net worth

Status: Accepted at the owner's request. Supersedes the archived-account inclusion
part of ADR 006.

## Context

Archived accounts represent positions the owner intentionally excludes from the
current net-worth workspace. Previously, archived balances still contributed.

## Decision

Current net worth includes active accounts only. Positive positions contribute to
assets and absolute negative positions to liabilities within each native currency.
Archived accounts contribute to neither totals, account-type breakdowns nor the
account list. Archived future-opening accounts are also omitted. Active accounts
opening in the future remain visible as excluded future accounts.

Archive/restore changes the scope of the current report, including for nonzero
asset and liability balances. Restoring an account reinstates its contribution.
Opening balances, ledger movements, category assignments and financial history
remain authoritative and are preserved. Spending reporting continues to include
archived account activity. Historical net-worth inclusion rules remain a future
reporting decision; archiving does not delete history.

## Consequences

The current figure describes assets minus liabilities for active accounts. The UI
states this scope. Archiving a debt can increase the displayed figure, just as
archiving an asset can decrease it. Tests cover both signs and archive/restore.
No schema migration is required.
