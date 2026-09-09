#!/bin/sh
# A strictly narrower sandbox than the parent paid-IP profile. No credentials.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../../../.." && pwd)
exec /usr/bin/sandbox-exec -f "$ROOT/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/loopback-only.sb" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"
