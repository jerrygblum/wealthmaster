# Local login and accounts

## Initial owner

Copy `.env.example` to `.env` and fill `INITIAL_OWNER_EMAIL`, `INITIAL_OWNER_PASSWORD`, `MFA_ENCRYPTION_PASSWORD`, and `MFA_ENCRYPTION_SALT`. See [MFA configuration](mfa.md). Use your own password, 12–72 characters and at most 72 UTF-8 bytes. Do not commit `.env`.

On an empty users table, startup requires both variables and stores a normalized email plus a Spring Security password hash. Once a user exists, the variables are ignored: they never change existing credentials. Remove the initial password from the environment after setup. A forgotten password currently has no self-service reset flow.

## Development

Start the local-only database port:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

Load `.env` into your shell before starting the backend (Spring does not automatically load it):

```sh
set -a
. ./.env
set +a
mvn -f backend/pom.xml spring-boot:run
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend, so cookies and CSRF remain same-origin. Accounts persist in PostgreSQL; sessions expire after 30 idle minutes or a backend restart.

For the full local Compose application, `.env` is read by Compose automatically: `docker compose up --build`, then open http://localhost:8088. Local HTTP uses `SESSION_COOKIE_SECURE=false`. Production HTTPS must use `SPRING_PROFILES_ACTIVE=prod` and `SESSION_COOKIE_SECURE=true`; the production default is secure. NAS deployment validation remains deferred.

## Tests

Run `mvn --batch-mode test -f backend/pom.xml` and `npm test --prefix frontend`. PostgreSQL integration tests use a disposable Testcontainers database when Docker is available; they are skipped when Docker is unavailable. CI requires Docker before running them.

Alternatively, run the integration tests against a **dedicated disposable PostgreSQL database** using `-Dtest.database.url=jdbc:postgresql://localhost:5432/wealthmaster_test`, `-Dtest.database.username=...`, and `-Dtest.database.password=...`. These tests delete account and audit rows. Never point them at your normal application database.

Browser tests use a separate disposable database with `DB_URL`, `DB_USER`, and `DB_PASSWORD` exported. Run `npx playwright install chromium` in `frontend`, then `npm run test:e2e`. Playwright starts backend/frontend and provisions only synthetic credentials (`owner@example.test` / `synthetic-password`). Tests require a dedicated database whose name ends in `_e2e`, seed isolated synthetic users, and run at desktop and mobile sizes. Do not use your normal database. CI provisions its own PostgreSQL service. If the bundled Chromium does not support your local OS but Google Chrome is installed, set `E2E_BROWSER_CHANNEL=chrome` to use it.

## Current behavior

Credit-card opening debt is entered as a positive amount and stored as a negative balance. An overpayment uses “In credit” and stays positive. Other account types use signed opening balances. Values are opening balances, not investment market valuations or ledger-derived current balances. Dates remain date-only.

Authenticator 2FA and security settings are implemented. Enrollment is optional only with the `dev` profile and required in production; enabled MFA is enforced in both. See [setup and recovery](mfa.md). Account management, ledger activity and current cash net worth are implemented. The default landing page shows net worth separately by native currency; see [current net worth](net-worth.md). Registration and password reset remain deferred.
