# Authenticator 2FA and recovery

## Configuration

Set both variables in your uncommitted `.env` or deployment secrets:

- `MFA_ENCRYPTION_PASSWORD`: a random value of at least 32 characters. Generate once with `openssl rand -hex 32`.
- `MFA_ENCRYPTION_SALT`: an even-length hex value representing at least 16 random bytes. Generate once with `openssl rand -hex 16`.

These are required in both development and production. The application fails startup if they are missing/invalid; it never invents replacement encryption keys. Preserve both across restarts. A database restore needs the original values to decrypt authenticator secrets. Back up deployment secrets securely alongside reconstruction configuration, with access separate from the database backup. Do not commit or log them. Automated encryption-key rotation is not implemented.

Only the explicit `dev` Spring profile makes enrollment optional. `prod`, no profile, and other profiles require enrollment before financial access. If `prod` and `dev` are both selected, MFA is required. An enabled factor is always checked, including in development. Existing un-enrolled users are sent to setup on their next production login.

## Activation

Open Settings → Security → Set up 2FA:

1. Re-enter your current password.
2. Scan the QR code or enter the manual key in a TOTP authenticator (six digits, 30 seconds).
3. Enter a code from the authenticator.
4. Save the ten single-use recovery codes using copy/download or manual copying. They cannot be shown again.
5. Check “I saved my recovery codes” and select Activate 2FA.

The saved-code checkbox records your confirmation; it cannot verify storage on your device. Until the last step, setup is pending and account protection has not changed. Setup expires after ten minutes. Cancel or restart an unfinished setup; reloading cannot retrieve previously displayed pending codes. Keep your device and NAS clocks synchronized.

After activation, login requires a password and then a new authenticator code or an unused recovery code. Each successfully verified time step can be used only once, so wait for the next code after an enrollment or another verification. The login challenge expires after five minutes. Five failures within five minutes impose a five-minute cooldown; signing in again does not reset factor failures.

## Replacement and recovery codes

Settings offers Replace authenticator and Generate new recovery codes. Both require password re-entry and a second-factor verification within five minutes. A just-completed second-factor login counts; otherwise enter a new authenticator code or an unused recovery code. This permits management immediately after using the last recovery code.

Replacement runs the enrollment wizard while the old authenticator remains active. Regeneration shows a pending recovery-code set while unused old codes remain active. Only saved-code confirmation replaces credentials. Cancelling leaves current credentials intact (a recovery code already used for identity verification stays consumed). Confirming either action invalidates other signed-in sessions and retains the initiating session.

Recovery login does not disable MFA. It opens settings and displays the remaining-code reminder. If your phone is lost, sign in with a recovery code and replace the authenticator. Losing both the authenticator and every recovery code has no self-service recovery path in this release.

## Verification and deployment

Flyway migration V003 adds MFA state, pending operations, recovery-code hashes, and persisted attempt limits. Application sessions remain in memory and expire on restart; active MFA survives in PostgreSQL.

Backend tests cover profile enforcement, session restrictions, CSRF, expiry, replay, concurrent recovery-code consumption, throttling, ownership, and management. Browser tests create isolated synthetic users in a dedicated database whose name ends in `_e2e`. Their only credentials and setup data are synthetic; never run fixtures against your application database. Managed browser tests use frontend port 5174 and backend port 8081 to avoid the usual development ports. CI runs desktop/mobile journeys under both `dev` and `prod`. For local production-mode browser checks, export `E2E_PROFILE=prod`; localhost tests explicitly allow a non-Secure cookie while keeping MFA enforcement enabled.
