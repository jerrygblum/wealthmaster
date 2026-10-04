# Threat Model (Living Document)

## Assets
- User credentials and MFA secrets
- Financial transactions/account metadata
- Uploaded statements/import files
- Investment holdings
- Backup files
- Market-data API credentials

## Primary threats
- Unauthorized cross-user data access
- Credential theft/account takeover
- Secret leakage through repository/logs
- Malicious or malformed uploaded files
- Injection attacks
- Insecure direct object references
- Accidental destructive import/update
- Exposed database/backups
- Dependency vulnerabilities

## Baseline mitigations
- Server-side ownership checks
- MFA
- Spring Security secure defaults
- Input/file validation
- Parameterized persistence via JPA/validated queries
- Size/type limits on uploads
- Secrets outside source control
- Audit/traceability for financial changes
- Conservative import behavior and rollback
- Network isolation of PostgreSQL
- HTTPS for exposed production traffic
- Routine dependency scanning/updates

Expand this document with concrete abuse cases as authentication and imports are implemented.

## Initial login/accounts slice

The owner explicitly deferred TOTP and recovery codes while password login and account creation are implemented. Password-only sessions are a temporary exception; MFA remains required before the personal production release. Registration and recovery/reset are also backlog items.

Authentication uses Spring Security session fixation protection, framework password hashing, CSRF checks on login/logout/account creation, and an HttpOnly SameSite=Lax cookie. Production cookies are Secure by default. The browser fetches a fresh masked CSRF token before every mutation. Login errors do not distinguish an unknown email from a wrong password. Session/authentication/account responses are not cacheable.

Every account query is scoped by the authenticated principal. Creation ignores frontend-supplied owner IDs and writes an account-creation audit event in the same transaction. Logs must not include request bodies, passwords, password hashes, or financial values. Initial owner environment credentials never overwrite an existing user.

Remaining production work includes mandatory MFA/recovery, login rate limiting, and a security review. No public registration or password-reset endpoint is provided in this slice.
