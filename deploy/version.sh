#!/usr/bin/env bash
# Issue #53 (amends #49): the build version is DECLARED in package.json
# ("version") — no git tags, no manual steps; the agent bumps it on the
# feature branch as a visible one-line PR diff. This script emits the full
# stamp:  <packageVersion>+<UTCts>.<shortSha>
# The +metadata (UTC second-resolution timestamp, short commit SHA) makes
# same-day builds and repeated deploys of the same version distinguishable.
# Fail-closed: no declared version → no stamp → the build must not ship.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=$(node -p "require('./package.json').version")
[ -n "$BASE" ] || { echo "FATAL: package.json has no version — refusing to stamp." >&2; exit 1; }
case "$BASE" in
  [0-9]*.[0-9]*.[0-9]*) ;; # plain semver x.y.z — no pre-release suffixes by design
  *) echo "FATAL: package.json version '$BASE' is not a plain x.y.z semver." >&2; exit 1 ;;
esac
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
SHA=$(git rev-parse --short HEAD)
echo "${BASE}+${TIMESTAMP}.${SHA}"
