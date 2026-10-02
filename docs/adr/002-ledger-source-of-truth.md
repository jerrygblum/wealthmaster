# ADR-002: Ledger is the financial source of truth

- Status: Accepted
- Date: 2026-10-02

## Context
Balances, budget totals, and net worth must remain explainable and internally consistent.

## Decision
Account balances derive from opening balances and ledger movements. Transfers are linked movements. Dashboard/report values derive from ledger/investment activity rather than independent authoritative balance fields.

## Alternatives considered
- Persist mutable current balance as source of truth: simpler reads but prone to divergence and weak traceability.

## Consequences
Financial writes require stronger domain invariants. Reads may later use caches/materialized views, but these are rebuildable derived data.
