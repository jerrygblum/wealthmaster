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
