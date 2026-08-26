#!/usr/bin/env bash
# Record the current HEAD as a successful GitHub deployment.
#
# Vercel deploys are CLI-only here — a git-triggered build would clone the
# 12 GB repo and die — so nothing otherwise reports deployment state to
# GitHub and the repo page shows no Deployments panel at all. This asserts
# the record that a CI pipeline would normally emit.
#
# Run after `vercel --prod`, or via `npm run deploy`, which chains both.
set -euo pipefail

REPO=neelb-01/Floodlit-xG
URL=https://floodlit-xg.vercel.app
SHA=$(git rev-parse HEAD)

# Only claim success if the live page really is serving this commit's build.
# Fail loudly rather than posting a green badge over a deploy that didn't land.
live=$(mktemp)
trap 'rm -f "$live"' EXIT
curl -sf "$URL/" -o "$live"
if ! git show "$SHA:frontend/index.html" | diff -q - "$live" >/dev/null; then
  echo "live site does not match ${SHA:0:8} — not recording" >&2
  exit 1
fi

# required_contexts must be a real JSON array, and must be present: omitting it
# gates the deployment on the commit's status checks instead of deploying.
id=$(gh api -X POST "repos/$REPO/deployments" --jq .id --input - <<JSON
{ "ref": "$SHA", "environment": "Production", "production_environment": true,
  "auto_merge": false, "required_contexts": [],
  "description": "Static build deployed to Vercel via CLI" }
JSON
)

gh api -X POST "repos/$REPO/deployments/$id/statuses" --jq .state --input - <<JSON
{ "state": "success", "environment": "Production", "environment_url": "$URL",
  "description": "Deployed and verified live" }
JSON

echo "recorded deployment $id at ${SHA:0:8}"
