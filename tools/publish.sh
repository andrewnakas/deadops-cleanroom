#!/bin/sh
# Gates, then push main and export/web -> gh-pages.  usage: sh tools/publish.sh
set -e
cd "$(dirname "$0")/.."
python -I tools/check_manifest.py
python -I tools/check_marks.py export/web
python -I tools/make_credits.py
git diff --quiet -- export/web/credits.html || { git add export/web/credits.html; git commit -qm "Regenerate credits"; }
git push -q origin main
git branch -D gh-pages >/dev/null 2>&1 || true
git subtree split --prefix export/web -b gh-pages >/dev/null
git push -q -f origin gh-pages
echo "published: https://andrewnakas.github.io/deadops-cleanroom/"
