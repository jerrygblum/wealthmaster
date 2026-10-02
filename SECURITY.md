# Security Policy

## Reporting

Please do not disclose suspected vulnerabilities in public GitHub issues. Use a private repository security advisory or contact the repository owner privately.

## Sensitive data policy

Never commit:
- `.env` production files;
- passwords, tokens, MFA secrets, API keys;
- real bank/credit-card/broker statements;
- production database dumps/backups;
- personal account identifiers;
- screenshots containing real financial information.

All public fixtures and demo data must be fully synthetic.

## Security baseline

- Authentication/authorization enforced by the backend.
- MFA mandatory for normal production users once auth is implemented.
- TOTP secrets/recovery codes handled using established security libraries and secure storage practices.
- HTTPS required for production access beyond a trusted local environment.
- Database is not directly exposed to the public internet.
- Dependencies receive routine security updates.
- Uploaded financial documents are treated as sensitive data.

A lightweight threat model will be maintained in `docs/security/threat-model.md` as features are introduced.
