# ADR-005: Deploy with Docker Compose on Synology

- Status: Accepted
- Date: 2026-10-02

## Context
The production target is a home Synology NAS and expected user count is small. Self-hostability is a product requirement.

## Decision
Package services as containers and deploy with Docker Compose/Synology Container Manager.

## Alternatives considered
- Kubernetes: unjustified complexity.
- Proprietary cloud platform: conflicts with self-hosting goal and introduces dependence not needed by the product.

## Consequences
Deployment remains portable to another Docker host/VPS. Operational documentation must include NAS backup, HTTPS, upgrades, and restore.
