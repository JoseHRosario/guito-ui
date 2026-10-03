#!/usr/bin/env bash
# Issue #49 (phase 1): rewrite the 0.0.0-dev placeholder in the environment
# files with the computed build stamp, right before the Angular build. CI runs
# this in every job that builds; a local build without it keeps the placeholder
# (semver-shaped fallback the specs assert against). Fails closed: an empty
# stamp must never be silently baked in.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${VERSION:-}" ]; then VERSION=$("$REPO_ROOT/deploy/version.sh"); fi
[ -n "$VERSION" ] || { echo "FATAL: VERSION is empty — refusing to stamp." >&2; exit 1; }

cd "$REPO_ROOT"
for f in src/environments/environment*.ts; do
  sed -i "s/0\.0\.0-dev/${VERSION}/" "$f"
  # Fail closed if the placeholder is gone (renamed/removed): a silent no-op
  # stamp would ship a build claiming a wrong version — worse than no stamp.
  grep -q -- "${VERSION}" "$f" || { echo "FATAL: stamp missing in $f — placeholder '0.0.0-dev' not found/replaced." >&2; exit 1; }
done
echo "Stamped version: $VERSION"
