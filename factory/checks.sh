#!/usr/bin/env bash
# The repo's checks. Exit 0 only when the branch is fit to review.
#
# The gate runs this script from the main checkout with the job's worktree as
# the working directory. Keep it fast, deterministic and non-interactive: no
# watch modes, no prompts, nothing that rewrites files.
#
# It mirrors the `ci` workflow (.github/workflows/ci.yml), plus the build. The
# tools run directly rather than through `npm run`, so a branch can't loosen
# the gate by editing package.json scripts.
set -euo pipefail

# A fresh worktree has no node_modules; reinstall when the lockfile changes.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi
export PATH="$PWD/node_modules/.bin:$PATH"

gitleaks git --redact --no-banner --exit-code 1 .
node scripts/check-forbidden-paths.mjs
oxlint src/ test/ scripts/
tsc --noEmit
vitest run --project unit --project integration --project e2e --update=none
nest build
