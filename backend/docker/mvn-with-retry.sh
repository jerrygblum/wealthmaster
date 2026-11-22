#!/bin/sh
# Maven Central can throttle shared CI egress. Never retry ordinary build failures.
set -eu
log=$(mktemp)
trap 'rm -f "$log"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
attempt=1
while :; do
    # -U also clears Maven's cached failed artifact resolution on the next attempt.
    if mvn -U "$@" >"$log" 2>&1; then
        cat "$log"
        exit 0
    else
        result=$?
    fi
    cat "$log"
    if [ "$attempt" -ge 3 ] || ! grep -Eq 'Could not transfer artifact.*(status code: (429|502|503|504)|Connection reset|[Cc]onnect timed out|Read timed out|Temporary failure in name resolution)' "$log"; then
        exit "$result"
    fi
    delay=$((attempt * 15))
    printf 'Transient Maven repository failure; retrying in %s seconds (attempt %s/3).\n' "$delay" "$((attempt + 1))" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
done
