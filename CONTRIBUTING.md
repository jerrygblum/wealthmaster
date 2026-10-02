# Contributing

This is primarily a personal product/portfolio project, but contributions and discussion are welcome.

Before changing financial/domain behavior, read:
- `AGENTS.md`
- `PRODUCT.md`
- `ARCHITECTURE.md`

## Change expectations

- Keep changes focused.
- Add tests for financial/domain logic.
- Use Flyway for schema changes.
- Update docs/ADRs when changing meaningful architecture or invariants.
- Never include real financial data.

## Commit style

Prefer conventional, descriptive commits such as:

```text
feat: add transfer creation workflow
fix: exclude transfers from expense totals
test: cover reconciliation mismatch cases
docs: record ledger source-of-truth decision
```
