#!/usr/bin/env bash
# Promote a clean build into the production-served path.
# Local `npm run build` writes to crm-app/dist/ and does NOT affect prod.
# Prod is served from crm-app/dist-prod/, populated only by this script.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "branch: $(git rev-parse --abbrev-ref HEAD)  sha: $(git rev-parse --short HEAD)"
git status --porcelain | grep -q . && echo "WARNING: working tree dirty"

( cd crm-app && rm -rf dist && npm run build )

rm -rf crm-app/dist-prod
cp -a crm-app/dist crm-app/dist-prod

docker restart crmlite-web

echo "Deployed $(git rev-parse --short HEAD) -> crm-app/dist-prod"
