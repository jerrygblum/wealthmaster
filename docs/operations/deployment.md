# Deployment

Target production platform: Synology NAS with Container Manager.

Initial services:
- `frontend`
- `backend`
- `postgres`

Use Docker Compose. Do not expose PostgreSQL publicly. Put the web application behind the Synology reverse proxy (or another explicitly chosen reverse proxy) with HTTPS.

Production values belong in environment/secrets outside Git.

A concrete NAS runbook will be added once the first deployment is performed and validated.
