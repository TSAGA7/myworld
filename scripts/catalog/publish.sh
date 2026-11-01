#!/usr/bin/env bash
# Publishes feed-data/catalog to the `data` branch, keeping whatever the feed workflow pushed meanwhile.
set -e
cd feed-data
git config user.name Claude
git config user.email noreply@anthropic.com
rm -rf /tmp/catalog && cp -r catalog /tmp/catalog
for i in 1 2 3 4; do
  git fetch -q --depth 1 origin data && git reset -q --hard origin/data || true
  rm -rf catalog && cp -r /tmp/catalog catalog
  git checkout -q --orphan next
  git add -A
  git commit -q -m "Каталоги $(date -u +%FT%H:%MZ)"
  if git push -q --force-with-lease=data:$(git rev-parse origin/data 2>/dev/null || echo '') origin next:data; then
    git checkout -q -B data origin/data 2>/dev/null || true; git branch -D next >/dev/null 2>&1 || true
    exit 0
  fi
  git checkout -q -B data origin/data || true; git branch -D next || true
  sleep 20
done
exit 1
