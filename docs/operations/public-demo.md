# Public shared demo

The demo is an independent deployment on the NAS. Anyone can select **Try demo**
without credentials and edit a shared fictional financial workspace. Every visitor
sees others' changes. Use fictional information only: visitor-entered text is public
until reset. Uploads/imports, registration, MFA/security management and external
market searches/refreshes are unavailable. Preferences, core account/ledger/category/
expectation editing, investment trades, manual fund NAVs, and the account Balance
on date read/forecast remain available.

The versioned dataset covers twelve calendar months through the business date:
CHF/EUR accounts, credit-card debt/payments, savings transfers, category spending,
refunds, expectations with reconciled occurrences, security lots/trades, daily
synthetic ETF and FX observations, manual fund NAVs, an archived account, scheduled
activity and an intentionally unpriced position. Missing-price warnings are expected.
No price provider is contacted during seeding or demo use. Ordinary restarts/updates
preserve edits; a daily reset installs the current seed version with fresh dates.

## Install on the NAS

1. Publish both application images from a successful CI run as for private
   production. Create a separate directory, for example
   `/volume1/docker/wealthmaster-demo`. Copy `docker-compose.demo.yml`,
   `.env.demo.example` and `scripts/demo-nas.sh` there. Do not combine Compose files.
2. Copy `.env.demo.example` to `.env`, restrict it with `chmod 600 .env`, and fill
   the image prefix and immutable `sha-<full commit SHA>` tag. Set
   `DEMO_PUBLIC_ORIGIN` to the exact HTTPS origin, such as `https://demo.example.com`,
   without a trailing slash. Generate each database/encryption value independently;
   do not reuse production secrets. Use `openssl rand -hex 32` for each password
   and `openssl rand -hex 16` for the encryption salt. Do not source the file.
3. Configure DNS and a trusted certificate for the demo hostname. In DSM reverse
   proxy, route this HTTPS hostname to HTTP `127.0.0.1:8089`. Keep the private
   hostname routed to its existing port. Demo cookies are Secure, HttpOnly and
   SameSite=Lax; use HTTPS even for acceptance testing.
4. From the demo directory, run (substitute `docker compose` if appropriate):

   ```sh
   sudo docker-compose --env-file .env -p wealthmaster-demo -f docker-compose.demo.yml config --quiet
   sudo docker-compose --env-file .env -p wealthmaster-demo -f docker-compose.demo.yml pull
   sudo docker-compose --env-file .env -p wealthmaster-demo -f docker-compose.demo.yml up -d
   sudo docker-compose --env-file .env -p wealthmaster-demo -f docker-compose.demo.yml ps
   ```

   The first start migrates and seeds atomically before readiness succeeds. The
   backend has a 768 MiB memory limit. Only the frontend is published, on loopback;
   the project gets its own network and `demo_postgres_data` volume. Do not attach
   private production volumes/networks or change the fixed database identity.
5. Verify Try demo, financial editing, the shared banner, fund NAV history and trend
   charts. Confirm there is no password form, upload action or online refresh.
   Normal production remains a separate installation with mandatory MFA.
6. In DSM Task Scheduler create a user-defined script task, using an account with
   Docker access. Schedule it **daily at 03:00**, with DSM timezone **Europe/Zurich**:

   ```sh
   sh /volume1/docker/wealthmaster-demo/demo-nas.sh reset /volume1/docker/wealthmaster-demo
   ```

   Enable failure notifications/log retention in DSM. The UI shows the scheduled
   next reset, not a guarantee that the external task ran. Monitor task results;
   the installation marker's `seeded_at` records the most recent successful seed.

## Reset, update and recovery

`demo-nas.sh reset [demo-directory]` verifies actual container project labels,
backend mode/database configuration, the database identity and the marker's single
recognised MEMBER. Any mismatch aborts before stopping or dropping data. It locks
`.demo-operation.lock`, stops only the demo backend, drops/recreates only
`wealthmaster_demo`, and restarts the same backend container. The frontend stays up
and returns a friendly JSON 503 with Retry-After while the backend is unavailable.
Seeding failure leaves the demo unavailable; there is no fallback database. Existing
sessions expire and visitors select Try demo again. Signing out normally affects
only that browser and does not reset or end other visitors' sessions.

For updates, edit only the demo `.env` image tag to the newly published immutable
version and run `sh demo-nas.sh update [demo-directory]`. The script verifies the
existing installation, pulls both images before stopping the backend, updates it,
waits for readiness, then recreates the frontend so Nginx resolves the new backend.
Updates preserve the dataset; the next reset applies any new dataset version.
The private `deploy-nas.sh` script remains specific to the private deployment.

Do not delete a lock until its operation has stopped. On failure, inspect only the
demo logs locally, correct the problem and start the demo backend again to retry
transactional startup. If database recreation succeeded but seeding failed, the
empty demo database can be seeded on restart. If the database is absent after a
CREATE failure, recreate `wealthmaster_demo` with owner `wealthmaster_demo` in the
verified demo PostgreSQL container before starting the backend. Do not disable
startup guards or use a production backup to recover a demo. No routine backup of
public visitor input is needed. Never run reset against private production.

## Limits and API

- `GET /api/v1/auth/demo`: no-store availability, next scheduled reset, timezone and
  dataset version. Normal installations return `enabled: false`.
- `POST /api/v1/auth/demo/session`: requires a fresh CSRF token; creates a server-
  selected shared identity, rotates session ID/CSRF, and returns the usual session
  with `demo: true` and `nextResetAt`. There is no selectable user ID. Disabled mode
  returns 404. Origin headers, when present, must match the configured HTTPS origin.
- Guest sessions expire after 30 minutes of inactivity. The marker generation is
  checked on requests, with no exemption in ordinary MFA policy.
- Demo Nginx limits requests globally to 30/second (burst 60), mutation requests to
  5/second (burst 10), and CSRF/session entry to 60/minute (burst 20). The deployment
  does not trust arbitrary forwarded IPs. Limits intentionally apply to the shared
  demo as a whole, so one visitor can temporarily affect others.
- The database atomically caps allowed guest mutation requests at 5,000 per dataset
  generation, including failed domain validations and preview requests. CSRF
  failures, session entry/logout, denied routes and seed operations do not consume
  this quota. Exhaustion returns 429 until reset; it never removes stored activity.
- Nginx caps request bodies at 64 KiB. Limits return 429 with Retry-After; maintenance
  returns 503 with retry guidance. Initial readiness may take a few minutes on NAS.

## Verification

Backend tests cover disabled mode, production MFA regression, startup guards,
repeatable seeding, guest route capabilities, shared sessions, CSRF/origin checks,
mutation quota and generation invalidation. Shell tests use a fake Docker executable
to exercise destructive reset failure boundaries without real data. Run the public
browser journey only against a dedicated synthetic demo using
`E2E_DEMO=true E2E_BASE_URL=https://... npm run test:e2e:demo`; it checks shared edits,
manual NAVs and unavailable actions on desktop/mobile. The test accepts a local
self-signed certificate only when E2E_DEMO is explicitly enabled.

For a complete local/CI acceptance run, execute `sh scripts/verify-demo.sh` from
the repository root with Docker and OpenSSL available. It refuses an existing demo
project/volume, builds local test images, runs HTTPS browser checks before and after
a real guarded reset, verifies generation/session invalidation, quotas, rate limits
and maintenance responses, then removes only its synthetic stack. CI requires this
job to pass before publishing either application image.

Backend image builds retain Maven dependencies in a BuildKit cache. Transient
repository transfer failures (HTTP 429/502/503/504 or selected network errors)
retry up to three attempts, waiting 15 then 30 seconds and forcing fresh artifact
resolution. Compilation errors and missing artifacts fail immediately. Persistent
repository failures still fail the job; inspect the build log before rerunning.

Account Card settings supports order, custom colors and bundled bank marks in the demo. Custom logo upload controls are hidden and `PUT /api/v1/accounts/{id}/logo` is denied by the explicit guest capability allowlist.
