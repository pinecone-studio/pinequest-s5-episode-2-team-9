#!/bin/sh
# Deploys the team's code to https://hololemma.vercel.app.
#
# The team works in pinecone-studio/pinequest-s5-episode-2-team-9 (remote "team9").
# This script:
#   1. pulls team9/main into the local main (fast-forward only),
#   2. mirrors it to the personal repo (remote "origin", brkh1222-byte/Hololemma),
#   3. deploys to production with the Vercel CLI under your account.
# Usage: npm run deploy            (production)
#        npm run deploy -- preview (preview URL only)
set -e
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "✋ You have uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

git fetch team9 main
git checkout -q main
git merge --ff-only team9/main
git push -q origin main

npm ci --no-audit --no-fund
npm test

if [ "$1" = "preview" ]; then
  npx -y vercel@latest deploy --yes
else
  npx -y vercel@latest deploy --prod --yes
fi
