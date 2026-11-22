#!/bin/sh
# Dedicated demo operations only. Never source .env or select a different Compose project.
set -eu
umask 077
die() { printf '%s\n' "$*" >&2; exit 1; }
case "${1:-}" in
  --help|'') printf 'Usage: sh demo-nas.sh reset|update [demo-directory]\n'; exit 0;;
  reset|update) action=$1;;
  *) die 'Expected reset or update.';;
esac
[ "$#" -le 2 ] || die 'Too many arguments.'
deploy_dir=$(cd "${2:-.}" && pwd -P) || die 'Demo directory not found.'
[ -f "$deploy_dir/.env" ] && [ -f "$deploy_dir/docker-compose.demo.yml" ] || die 'Demo .env and standalone Compose file are required.'
# Prevent environment overrides from changing which deployment or database the script reaches.
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES COMPOSE_ENV_FILES
unset WEALTHMASTER_IMAGE_TAG WEALTHMASTER_IMAGE_PREFIX DEMO_PUBLIC_ORIGIN DEMO_POSTGRES_PASSWORD DEMO_MFA_ENCRYPTION_PASSWORD DEMO_MFA_ENCRYPTION_SALT
if command -v docker-compose >/dev/null 2>&1; then kind=standalone; else kind=plugin; fi
compose() (
  cd "$deploy_dir"
  if [ "$kind" = standalone ]; then docker-compose --env-file .env -p wealthmaster-demo -f docker-compose.demo.yml "$@";
  else docker compose --env-file .env -p wealthmaster-demo -f docker-compose.demo.yml "$@"; fi
)
lock_dir=$deploy_dir/.demo-operation.lock
mkdir "$lock_dir" 2>/dev/null || die 'Another demo reset/update is running. Check the operation before removing its lock.'
trap 'rmdir "$lock_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose config --quiet
postgres_id=$(compose ps -q postgres)
backend_id=$(compose ps -q backend)
[ -n "$postgres_id" ] && [ -n "$backend_id" ] || die 'An existing demo deployment is required.'
for service_id in "$postgres_id" "$backend_id"; do
  [ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$service_id")" = wealthmaster-demo ] || die 'Wrong Compose project; refusing operation.'
done
# Check the ACTUAL running configuration, not only the supplied Compose file.
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$postgres_id")" = postgres ] || die 'Wrong database service.'
[ "$(compose exec -T postgres sh -c 'printf "%s/%s" "$POSTGRES_DB" "$POSTGRES_USER"')" = wealthmaster_demo/wealthmaster_demo ] || die 'Wrong database identity.'
compose exec -T backend sh -c 'test "$APP_DEMO_ENABLED" = true && test "$SPRING_PROFILES_ACTIVE" = prod && test "$DB_URL" = jdbc:postgresql://postgres:5432/wealthmaster_demo && test "$DB_USER" = wealthmaster_demo && test -z "$INITIAL_OWNER_EMAIL" && test -z "$INITIAL_OWNER_PASSWORD"' || die 'Backend is not an isolated demo.'
marker=$(compose exec -T postgres psql -X -qAt -v ON_ERROR_STOP=1 -U wealthmaster_demo -d wealthmaster_demo -c "SELECT CASE WHEN current_database()='wealthmaster_demo' AND (SELECT count(*) FROM app_users)=1 AND EXISTS(SELECT 1 FROM demo_installation d JOIN app_users u ON u.id=d.user_id WHERE d.id=1 AND d.dataset_version>0 AND u.email='demo@wealthmaster.example' AND u.role='MEMBER') THEN 'verified-demo' ELSE 'refuse' END")
[ "$marker" = verified-demo ] || die 'Missing or unrecognised demo marker; refusing operation.'
if [ "$action" = update ]; then
  [ "$(awk '/^WEALTHMASTER_IMAGE_TAG=/{n++} END {print n+0}' "$deploy_dir/.env")" = 1 ] || die 'Configure exactly one immutable image tag.'
  tag=$(awk -F= '/^WEALTHMASTER_IMAGE_TAG=/{print $2}' "$deploy_dir/.env")
  printf '%s\n' "$tag" | LC_ALL=C grep -Eq '^sha-[0-9a-f]{40}$' || die 'Set an immutable full sha-... image tag before updating the demo.'
  # The operator edits the immutable tag in the demo .env before invoking update.
  compose pull backend frontend
fi
compose stop backend
# Failure from here deliberately leaves the backend stopped; the frontend returns maintenance.
if [ "$action" = reset ]; then
  compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U wealthmaster_demo -d postgres -c 'DROP DATABASE wealthmaster_demo WITH (FORCE)'
  compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U wealthmaster_demo -d postgres -c 'CREATE DATABASE wealthmaster_demo OWNER wealthmaster_demo'
  compose start backend
else
  compose up -d --no-deps backend
fi
# Bound the wait and check readiness after migration/seeding.
attempt=0
while [ "$attempt" -lt 90 ]; do
  if compose exec -T backend wget --quiet --tries=1 --spider http://localhost:8080/actuator/health/readiness; then
    if [ "$action" = update ]; then compose up -d --no-deps --force-recreate frontend; fi
    printf 'Demo %s completed; dataset is ready.\n' "$action"
    exit 0
  fi
  attempt=$((attempt+1))
  sleep 2
done
compose stop backend
die 'Demo failed readiness. Backend left stopped; inspect demo service logs locally.'
