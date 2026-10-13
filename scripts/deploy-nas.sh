#!/bin/sh
# Run on the NAS from its existing deployment directory; never source .env.
set -eu
umask 077

die() { printf '%s\n' "$*" >&2; exit 1; }
if [ "${1:-}" = "--help" ]; then
    printf 'Usage: sh deploy-nas.sh sha-<40-character commit SHA> [deployment-directory]\n'
    exit 0
fi
[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die 'Usage: sh deploy-nas.sh sha-<40-character commit SHA> [deployment-directory]'
release_tag=$1
printf '%s\n' "$release_tag" | LC_ALL=C grep -Eq '^sha-[0-9a-f]{40}$' || die 'Use the full sha-... tag from a successful CI image-publishing run.'
deploy_dir=$(cd "${2:-.}" && pwd -P) || die 'Deployment directory not found.'
env_file=$deploy_dir/.env
[ -f "$env_file" ] && [ -f "$deploy_dir/docker-compose.prod.yml" ] || die 'The existing .env and docker-compose.prod.yml are required.'
health_timeout=${DEPLOY_HEALTH_TIMEOUT:-300}
case "$health_timeout" in ''|*[!0-9]*) die 'DEPLOY_HEALTH_TIMEOUT must be an integer from 1 to 3600.';; esac
[ "$health_timeout" -gt 0 ] && [ "$health_timeout" -le 3600 ] || die 'DEPLOY_HEALTH_TIMEOUT must be an integer from 1 to 3600.'
unset WEALTHMASTER_IMAGE_TAG
if command -v docker-compose >/dev/null 2>&1; then
    compose_kind=standalone
elif docker compose version >/dev/null 2>&1; then
    compose_kind=plugin
else
    die 'Docker Compose is required (docker-compose or docker compose).'
fi
compose() (
    cd "$deploy_dir"
    if [ "$compose_kind" = standalone ]; then
        docker-compose --env-file .env -p wealthmaster -f docker-compose.prod.yml "$@"
    else
        docker compose --env-file .env -p wealthmaster -f docker-compose.prod.yml "$@"
    fi
)
docker info >/dev/null 2>&1 || die 'Cannot access Docker. Run this script with sudo or an authorized Docker account.'
lock_dir=$deploy_dir/.deploy.lock
mkdir "$lock_dir" 2>/dev/null || die 'Another deployment may be running (.deploy.lock exists). Check before removing a stale lock.'
backup_dir=
env_next=
backend_paused=0
env_replaced=0
update_started=0
cleanup() {
    result=$?
    trap - EXIT INT TERM
    if [ "$result" -ne 0 ]; then
        if [ "$update_started" -eq 0 ]; then
            if [ "$env_replaced" -eq 1 ]; then
                if cp "$backup_dir/.env" "$env_file"; then
                    chmod 600 "$env_file"
                else
                    printf 'Could not restore .env. Restore it manually from %s/.env.\n' "$backup_dir" >&2
                fi
            fi
            if [ "$backend_paused" -eq 1 ]; then
                compose start backend || printf 'Could not restart the previous backend. Check Docker locally.\n' >&2
            fi
        else
            printf 'Update failed after container replacement began. No automatic rollback was attempted: migrations may have run.\n' >&2
            printf 'Keep the current containers for diagnosis. Recovery backup: %s\n' "$backup_dir" >&2
        fi
        [ -z "$backup_dir" ] || printf 'Backup directory: %s\n' "$backup_dir" >&2
    fi
    [ -z "$env_next" ] || rm -f "$env_next"
    rmdir "$lock_dir"
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose config --quiet
tag_lines=$(awk '/^[[:space:]]*(export[[:space:]]+)?WEALTHMASTER_IMAGE_TAG[[:space:]]*=/ {n++} END {print n+0}' "$env_file")
[ "$tag_lines" -eq 1 ] || die '.env must contain exactly one WEALTHMASTER_IMAGE_TAG entry.'
postgres_id=$(compose ps -q postgres)
backend_id=$(compose ps -q backend)
frontend_id=$(compose ps -q frontend)
[ -n "$postgres_id" ] && [ -n "$backend_id" ] && [ -n "$frontend_id" ] || die 'This script updates an existing installation; all three containers must exist.'
[ "$(docker inspect --format '{{.State.Status}}' "$backend_id")" = running ] || die 'The current backend must be running before a normal update.'
compose exec -T postgres sh -c 'exec pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
mkdir -p "$deploy_dir/backups"
chmod 700 "$deploy_dir/backups"
backup_dir=$(mktemp -d "$deploy_dir/backups/deploy-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
cp "$env_file" "$backup_dir/.env"
cp "$deploy_dir/docker-compose.prod.yml" "$backup_dir/docker-compose.prod.yml"
chmod 600 "$backup_dir/.env" "$backup_dir/docker-compose.prod.yml"
docker inspect --format '{{.Config.Image}} {{.Image}}' "$backend_id" "$frontend_id" "$postgres_id" > "$backup_dir/images.txt"
printf 'Backing up to %s. Pausing the backend to prevent writes.\n' "$backup_dir"
backend_paused=1
compose stop backend
compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump.partial"
[ -s "$backup_dir/database.dump.partial" ] || die 'Database backup is empty; deployment aborted.'
compose exec -T postgres pg_restore --list < "$backup_dir/database.dump.partial" > /dev/null
mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
printf 'Backup archive verified. Downloading %s.\n' "$release_tag"
WEALTHMASTER_IMAGE_TAG=$release_tag compose config --quiet
WEALTHMASTER_IMAGE_TAG=$release_tag compose pull backend frontend
env_next=$(mktemp "$deploy_dir/.deploy.env.XXXXXX")
awk -v tag="$release_tag" '
    /^[[:space:]]*(export[[:space:]]+)?WEALTHMASTER_IMAGE_TAG[[:space:]]*=/ {print "WEALTHMASTER_IMAGE_TAG=" tag; next}
    {print}
' "$env_file" > "$env_next"
chmod 600 "$env_next"
mv "$env_next" "$env_file"
env_next=
env_replaced=1
compose config --quiet
update_started=1
compose up -d --no-deps backend frontend
backend_paused=0

printf 'Waiting for application health (up to %s seconds).\n' "$health_timeout"
elapsed=0
while [ "$elapsed" -lt "$health_timeout" ]; do
    backend_id=$(compose ps -q backend)
    frontend_id=$(compose ps -q frontend)
    backend_health=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$backend_id" 2>/dev/null || true)
    postgres_health=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$postgres_id" 2>/dev/null || true)
    frontend_status=$(docker inspect --format '{{.State.Status}}' "$frontend_id" 2>/dev/null || true)
    if [ "$backend_health" = 'running healthy' ] && [ "$postgres_health" = 'running healthy' ] && [ "$frontend_status" = running ]; then
        if compose exec -T frontend wget -q --spider http://127.0.0.1/; then
            compose ps
            printf 'Deployment complete: %s\nBackup: %s\nOpen your HTTPS address and sign in again.\n' "$release_tag" "$backup_dir"
            exit 0
        fi
    fi
    sleep 5
    elapsed=$((elapsed + 5))
done
die 'Application health did not recover in time. Inspect service logs on the NAS; do not delete the database volume.'
