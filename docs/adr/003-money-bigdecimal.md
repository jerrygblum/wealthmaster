# ADR-003: Represent money with BigDecimal and explicit currency

- Status: Accepted
- Date: 2026-10-02

## Context
Binary floating-point arithmetic can introduce unacceptable rounding behavior in financial calculations. The application is multi-currency.

## Decision
Use Java `BigDecimal` for monetary arithmetic, PostgreSQL `NUMERIC` for persistence, and explicit ISO 4217 currency codes for every monetary amount.

## Alternatives considered
- `double`: rejected for financial arithmetic.
- Integer minor units only: useful for simple currencies but insufficiently convenient for prices, FX, and varying decimal requirements.

## Consequences
Rounding modes/scales must be explicit where calculations require them. Tests must cover rounding boundaries.
