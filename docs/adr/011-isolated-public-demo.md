# 011 — Isolated public editable demo

Status: Accepted following the owner's explicit request for a password-free shared
sandbox in a separate deployment.

## Decision

Run the public demo as its own production-profile Compose project, database, network,
volume and secrets. It contains only fictional data. Normal user MFA and the private
production deployment remain unchanged. Demo mode defaults off and fails startup
unless the database is `wealthmaster_demo`, no owner credentials are configured,
and its users are either absent or the single recognised demo MEMBER.

V021 adds an installation marker with the shared identity, generation, seed version,
seed timestamp and mutation-request counter. Provisioning and financial seeding are
atomic and use normal application services. The demo password is random, discarded
and unavailable for sign-in. A public CSRF-protected Try demo endpoint creates an
explicit ROLE_DEMO session bound to that marker, without invoking or weakening normal
MFA sessions. A distinct method/path allowlist grants core finance editing only;
new APIs are denied until reviewed. Imports/uploads, identity/security management,
registration, invitations and external market calls are excluded server-side.

All visitors see and edit one shared dataset; the UI states this and requests fictional
input only. Demo data is disposable, including visitor changes and audit records.
Synology Task Scheduler invokes a guarded operator script at 03:00 Europe/Zurich to
stop the demo backend, recreate only the verified demo database and restart/migrate/
seed it. No public reset API or new worker is introduced. Normal private financial
history is never reset by this mechanism. Reset/update share a lock and retain the
frontend for maintenance feedback; readiness requires successful complete seeding.

Nginx applies global/entry/write rate limits, the backend caps guest mutation requests
at 5,000 per generation, and the demo backend has a memory limit. These limits can
make the shared demo temporarily unavailable to all visitors; this is an acceptable
tradeoff for a small NAS portfolio showcase. They do not provide isolation from a
compromised NAS host or eliminate shared-host resource contention.

## Consequences

Reuse published application images with a demo-only Nginx configuration. Operators
maintain a separate hostname, TLS certificate, environment file and scheduled task.
No production secrets or financial records may enter the demo. Dataset revisions
are applied on reset, not by overwriting edits during ordinary restarts or updates.
See [demo operations](../operations/public-demo.md) for deployment and recovery.
