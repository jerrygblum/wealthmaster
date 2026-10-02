#!/usr/bin/env sh
set -eu

printf '\n== Backend tests ==\n'
(cd backend && mvn --batch-mode test)

printf '\n== Frontend install/build/tests ==\n'
(cd frontend && npm install && npm run build && npm test)

printf '\nVerification complete.\n'
