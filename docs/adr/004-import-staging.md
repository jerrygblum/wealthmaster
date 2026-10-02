# ADR-004: Stage imports before committing to the ledger

- Status: Accepted
- Date: 2026-10-02

## Context
Bank/broker files vary, may contain duplicates or malformed rows, and are sensitive source records. Direct parser-to-ledger writes make mistakes difficult to inspect or reverse.

## Decision
All external imports pass through staged raw/normalized records, validation, duplicate detection, categorization, and user preview before commit. Source lineage is preserved.

## Alternatives considered
- Direct parsing into transactions: faster POC but poor auditability/recovery.

## Consequences
Import code has more explicit stages but supports review, metrics, rollback, and future CSV/XLSX/PDF/API sources consistently.
