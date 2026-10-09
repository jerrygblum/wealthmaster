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

## Login, MFA, and user settings

Production and all profiles other than explicit development require MFA enrollment before financial access. Production wins if `prod` and `dev` are both selected. Development allows users without MFA to use passwords alone; enabled MFA is always enforced. Registration and password-reset flows remain deferred.

Password login creates a restricted session for users with MFA or required enrollment. The server checks the session identity, authority, expiry, and persisted security version on protected requests. Financial endpoints require fully completed authentication. Activation/replacement/regeneration advance the security version and revoke other sessions, while rotating and preserving the initiating verified session. A second-factor login challenge expires after five minutes.

Enrollment is session-bound and expires after ten minutes. Password re-entry, a working authenticator code, and saved-recovery-code confirmation are required before activation. The old factor remains active during replacement. Regeneration replaces old recovery codes only on confirmation. Management requires password re-entry and second-factor verification within five minutes; a recent recovery login counts, including use of the last code.

TOTP uses a standard library with six digits, 30-second steps, and one-step clock tolerance. Successful time steps cannot be replayed. Secrets use Spring Security AES-GCM encryption with deployment-supplied credentials. Recovery codes have 128 random bits, are displayed once, hashed, and atomically consumed. Login and factor failures have separate persisted rate-limit counters: five failures within five minutes cause a five-minute cooldown. New password sessions do not reset failed second-factor attempts. Unknown login identities receive the same generic failures and limits.

CSRF is enforced on mutations, session cookies are HttpOnly/SameSite=Lax and Secure by default in production, and security responses are not cacheable. No secrets, codes, setup URIs, password hashes, or sensitive financial payloads are logged. QR generation stays in the browser. Audit events record activation, replacement, regeneration, and recovery-code use without secret data.

Remaining production work includes deployment validation, backup/restore drills, operational monitoring, and security review. There is no email/SMS notification, trusted-device bypass, MFA disable action, or support-based factor reset. Losing both the authenticator and all recovery codes has no self-service recovery path.
