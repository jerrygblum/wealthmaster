# Deployment

Target: Synology NAS using Docker Compose. The first installation is being prepared
for a DS920+ with DSM 7.1.1 and Docker 20.10.3. On-device validation is still pending.

## GitHub image publishing

The `CI` workflow tests backend, frontend and browser journeys, and validates the
production Compose configuration. After all checks pass on `main`, it publishes:

- `ghcr.io/jerrygblum/wealthmaster-backend:sha-<full commit SHA>`
- `ghcr.io/jerrygblum/wealthmaster-frontend:sha-<full commit SHA>`

The image prefix follows the lowercased GitHub repository name, so forks must
change `WEALTHMASTER_IMAGE_PREFIX`. Images target `linux/amd64` for the DS920+.
Attestations are disabled to publish single-platform manifests for its older engine.
The backend image includes `wget` for its health check.

Publishing runs on pushes to `main`; Actions → CI → Run workflow on `main` can
rerun checks and publish manually. Pull requests only validate. Both publishing
jobs must finish successfully before deploying the version shown in their summaries.
There is no automatic NAS update and no NAS credentials are stored in GitHub.

Publishing uses the built-in `GITHUB_TOKEN` with job-scoped `packages: write`.
Organization policies must allow package publishing. Packages may initially be
private even when the repository is public. Choose one access method:

- For public code images, set both packages to Public under the owner's GitHub
  Packages settings. Images contain application code only, not deployment secrets.
- For private packages, authenticate on the NAS with `sudo docker login ghcr.io -u USERNAME`.
  At the password prompt, enter a classic personal access token with `read:packages`
  and access to those packages. Keep the token out of shell arguments and Git.

References: [publishing images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
and [registry authentication and visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry).

## First installation

These are reference instructions; for a guided installation, perform one step at a time.

1. Create a normal `wealthmaster` folder in the NAS `docker` shared folder
   (typically `/volume1/docker/wealthmaster`).
2. Merge the deployment changes into GitHub `main` and wait for **all** CI jobs,
   including both image publishing jobs, to succeed. Record the full `sha-...` tag.
3. Copy only `docker-compose.prod.yml` and `.env.production.example` from that
   revision into the NAS folder. Source folders are unnecessary.
4. Enable SSH for setup under DSM Control Panel → Terminal & SNMP. Connect from
   your computer using an administrator account. Confirm `sudo docker version`
   and `sudo docker-compose version`. These commands assume the standalone
   `docker-compose` binary; if only the Compose plugin is available, substitute
   `docker compose` throughout. Compose 1.27+ or v2 is required. Check versions
   before proceeding; do not install arbitrary replacement binaries on the NAS.
5. In the deployment directory, copy `.env.production.example` to `.env`, restrict
   its permissions with `chmod 600 .env`, and populate it in a text editor.
   Set the tag from step 2, unique database and owner passwords, your email,
   and the MFA encryption values. Generate each random value separately with
   the commands in the example. Do not post secrets in chat or commit them.
   Keep the environment file as Compose configuration; do not source it in a shell.
6. Configure a DSM reverse proxy HTTPS endpoint for your chosen hostname, with a
   trusted certificate. Its destination is HTTP `127.0.0.1:8088` on the NAS.
   Ensure the hostname resolves to the NAS on the network where you will use it.
   Only the frontend port is bound, on loopback; backend and PostgreSQL have no
   published ports. Production enforces MFA and Secure session cookies.
7. Authenticate to GHCR if packages are private, then run from the deployment folder:

   ```sh
   sudo docker-compose -p wealthmaster -f docker-compose.prod.yml config --quiet
   sudo docker-compose -p wealthmaster -f docker-compose.prod.yml pull
   sudo docker-compose -p wealthmaster -f docker-compose.prod.yml up -d
   sudo docker-compose -p wealthmaster -f docker-compose.prod.yml ps
   ```

   Use `config --quiet`; full `config` output includes interpolated secrets.
   PostgreSQL and backend must become healthy and frontend must stay running.
   The NAS may need a few minutes for initial startup and Flyway migrations.
   If startup fails, inspect the failed service locally with Compose `logs --tail=100 SERVICE`;
   redact sensitive values before sharing logs. Do not weaken container security
   settings to work around an engine compatibility failure; investigate it first.
8. Visit the HTTPS address, sign in as the owner, enroll TOTP, and save recovery
   codes. Verify a synthetic account and transaction survive a Compose restart
   before entering real financial data. Remove initial owner credentials from `.env`
   and rerun `up -d` to remove them from the backend container environment.

The production file is standalone: do not combine it with `docker-compose.yml`
or the development override. Always use `-p wealthmaster` and the same directory
to retain the same named database volume.

PostgreSQL 18 requires the volume at `/var/lib/postgresql`; see the
[official image documentation](https://hub.docker.com/_/postgres).
The production file uses that path. Do not repoint an existing installation's
volume without planning and verifying a backup/restore. This runbook assumes a
fresh production database, not migration of development containers.

## Updates and recovery

Before using real data, establish the [backup/restore procedure](backup-restore.md).
A Docker volume is not a backup. Preserve the database, `.env`, and exact deployed
image tag; restored MFA data requires the original encryption password and salt.
Limit access to the deployment folder and Docker administration to trusted admins.

For each manual update:

1. Back up PostgreSQL and preserve the matching configuration securely. Record the
   current image tag and review any migration/operational notes.
2. Wait for all CI and publishing jobs on the desired `main` revision to pass.
3. Change only `WEALTHMASTER_IMAGE_TAG` in the NAS `.env` to that revision's tag.
4. Run the same `pull`, `up -d`, and `ps` commands, then check HTTPS login and data.

App sessions end when the backend restarts. Flyway applies migrations automatically.
Changing the tag back does not undo migrations: if the previous app cannot use
the new schema, restore the pre-update backup and matching configuration before
running the old version. Never use `down -v` on production; it deletes the database
volume. Do not regenerate MFA encryption keys during an update.

GitHub builds, NAS engine compatibility, HTTPS proxy behavior, persistence, and
backup/restore still need validation on the actual installation. Record results
here as the guided first deployment progresses.
