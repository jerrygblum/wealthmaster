# ADR-001: Use a modular monolith

- Status: Accepted
- Date: 2026-10-02

## Context
The application is expected to serve one to a small number of users, run on a Synology NAS, and cover several related financial domains. The project should demonstrate sound architecture without operational complexity that does not serve the product.

## Decision
Use a Spring Boot modular monolith with clear package/domain boundaries and a separate React SPA. Deploy backend, frontend, and PostgreSQL with Docker Compose.

## Alternatives considered
- Microservices: unnecessary operational/distributed-system cost.
- Single full-stack framework: less aligned with the chosen learning goal.

## Consequences
Domain boundaries must be maintained in code rather than by process/network boundaries. Components can be extracted later only if a real need emerges.
