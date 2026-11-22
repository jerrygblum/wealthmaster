#!/bin/sh
# Local/CI acceptance test. Refuses an existing wealthmaster-demo deployment or volume.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
[ -z "$(docker ps -aq --filter label=com.docker.compose.project=wealthmaster-demo)" ] || { echo 'An existing demo project is present; refusing acceptance test.' >&2; exit 1; }
[ -z "$(docker volume ls -q --filter name=wealthmaster-demo_demo_postgres_data)" ] || { echo 'An existing demo volume is present; refusing acceptance test.' >&2; exit 1; }
[ -z "$(docker ps -aq --filter 'name=^/wealthmaster-demo-check-tls$')" ] || { echo 'A test TLS container already exists; refusing acceptance test.' >&2; exit 1; }
work=$(mktemp -d)
started=0
compose() { docker compose --env-file "$work/.env" -p wealthmaster-demo -f "$work/docker-compose.demo.yml" "$@"; }
cleanup() {
    result=$?
    trap - EXIT INT TERM
    if [ "$result" -ne 0 ] && [ "$started" = 1 ]; then compose logs --tail=80 backend frontend >&2 || true; fi
    docker rm -f wealthmaster-demo-check-tls >/dev/null 2>&1 || true
    if [ "$started" = 1 ]; then compose down -v >/dev/null 2>&1 || true; fi
    # work contains only generated synthetic test configuration/certificates.
    case "$work" in /tmp/*|/private/tmp/*|/var/folders/*) rm -rf "$work";; esac
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cp docker-compose.demo.yml "$work/docker-compose.demo.yml"
cat > "$work/.env" <<'CONFIG'
WEALTHMASTER_IMAGE_PREFIX=wealthmaster-demo-check
WEALTHMASTER_IMAGE_TAG=local
DEMO_PUBLIC_ORIGIN=https://demo-tls
DEMO_POSTGRES_PASSWORD=synthetic-demo-db-test-only
DEMO_MFA_ENCRYPTION_PASSWORD=synthetic-demo-encryption-password-test-only
DEMO_MFA_ENCRYPTION_SALT=0123456789abcdef0123456789abcdef
CONFIG
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$work/key.pem" -out "$work/cert.pem" -days 1 -subj /CN=demo-tls >/dev/null 2>&1
cat > "$work/tls.conf" <<'NGINX'
server {
    listen 443 ssl;
    ssl_certificate /test/cert.pem;
    ssl_certificate_key /test/key.pem;
    location / { proxy_pass http://frontend:80; proxy_set_header Host $host; }
}
NGINX
docker build -t wealthmaster-demo-check-backend:local backend
docker build -t wealthmaster-demo-check-frontend:local frontend
started=1
compose up -d --wait --wait-timeout 240
docker run -d --rm --name wealthmaster-demo-check-tls --network wealthmaster-demo_default --network-alias demo-tls -v "$work:/test:ro" -v "$work/tls.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.29-alpine
mkdir "$work/sessions"
# Browser dependencies are test-only and use a named cache volume.
docker run --rm --network wealthmaster-demo_default -v "$work/sessions:/sessions" -e E2E_DEMO_STORAGE_DIR=/sessions -e E2E_DEMO=true -e E2E_BASE_URL=https://demo-tls -v "$root/frontend:/work" -v wealthmaster-demo-check-node:/work/node_modules -w /work mcr.microsoft.com/playwright:v1.63.0-noble sh -c 'npm ci --no-audit --no-fund && npm run test:e2e:demo'
before_generation=$(compose exec -T postgres psql -X -qAt -U wealthmaster_demo -d wealthmaster_demo -c 'SELECT generation FROM demo_installation WHERE id=1')
sh scripts/demo-nas.sh reset "$work"
after_generation=$(compose exec -T postgres psql -X -qAt -U wealthmaster_demo -d wealthmaster_demo -c 'SELECT generation FROM demo_installation WHERE id=1')
[ "$before_generation" != "$after_generation" ] || { echo 'Reset did not change generation.' >&2; exit 1; }
[ "$(compose exec -T postgres psql -X -qAt -U wealthmaster_demo -d wealthmaster_demo -c 'SELECT count(*) FROM financial_accounts')" = 7 ] || { echo 'Reset did not restore the baseline dataset.' >&2; exit 1; }
# Reset really restores the dataset; run the same journey after sessions/data were discarded.
docker run --rm --network wealthmaster-demo_default -v "$work/sessions:/sessions" -e E2E_DEMO_STORAGE_DIR=/sessions -e E2E_DEMO=true -e E2E_DEMO_AFTER_RESET=true -e E2E_BASE_URL=https://demo-tls -v "$root/frontend:/work" -v wealthmaster-demo-check-node:/work/node_modules -w /work mcr.microsoft.com/playwright:v1.63.0-noble npm run test:e2e:demo
# Verify durable quota and proxy rate/maintenance behavior against the packaged stack.
compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U wealthmaster_demo -d wealthmaster_demo -c 'UPDATE demo_installation SET mutation_requests=5000'
check_http() {
    docker run --rm --network wealthmaster-demo_default -v "$work/sessions:/sessions:ro" -v "$root/frontend:/work" -v "$root/scripts/check-demo-http.cjs:/checks.cjs:ro" -v wealthmaster-demo-check-node:/work/node_modules -w /work mcr.microsoft.com/playwright:v1.63.0-noble node /checks.cjs "$1"
}
check_http quota
check_http rate
compose stop backend
check_http maintenance
