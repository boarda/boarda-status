#!/usr/bin/env bash
# Publish page/ to the gh-pages branch. GitHub Pages serves status.boarda.io from that branch.
#
# The page is static: it reads Upptime's data (history/*.yml, history/summary.json, GitHub issues)
# in the browser, so it only needs publishing when page/ changes, never when Upptime commits.
# Upptime's own "Static Site CI" (site.yml) is disabled so its nightly build does not overwrite it.
# To go back to the stock Upptime page: gh workflow enable site.yml && gh workflow run site.yml
#
# Usage: scripts/deploy-page.sh BRDSPRINT-123
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${1:?usage: scripts/deploy-page.sh BRDSPRINT-123}"
SRC_REV="$(git rev-parse --short HEAD)"
ROOT="$(pwd)"
TMP="$(mktemp -d)/site"

git fetch -q origin gh-pages
git worktree add -q --detach "$TMP" origin/gh-pages
trap 'git -C "$ROOT" worktree remove --force "$TMP"' EXIT

find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R page/. "$TMP"/
touch "$TMP/.nojekyll"
# GitHub Pages lets browsers cache files for 10 minutes; a version stamp makes each release load at once.
sed -i.bak -e "s|/status.css\"|/status.css?v=$SRC_REV\"|" -e "s|/status.js\"|/status.js?v=$SRC_REV\"|" "$TMP/index.html"
rm -f "$TMP/index.html.bak"

cd "$TMP"
git add -A
if git diff --cached --quiet; then
  echo "Nothing to publish"
  exit 0
fi
git commit -q -m "$KEY: publish status page from $SRC_REV"
git push -q origin HEAD:gh-pages
echo "Published $SRC_REV to gh-pages"
