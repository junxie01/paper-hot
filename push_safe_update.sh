#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

DEFAULT_MESSAGE="Fix deep reference enrichment writeback"
COMMIT_MESSAGE="${1:-$DEFAULT_MESSAGE}"

echo "Current changes:"
git status --short
echo

echo "Staging tracked project files only..."
git add -u
git add backend/journal_whitelist.py push_safe_update.sh

if git diff --cached --quiet; then
    echo "No tracked changes are staged. Nothing to commit."
    exit 0
fi

echo
echo "Files to commit:"
git diff --cached --name-only
echo

echo "Commit message: ${COMMIT_MESSAGE}"
git commit -m "${COMMIT_MESSAGE}"

CURRENT_BRANCH="$(git branch --show-current)"
if [ -z "${CURRENT_BRANCH}" ]; then
    CURRENT_BRANCH="main"
fi

echo
echo "Pushing to origin/${CURRENT_BRANCH}..."
git push origin "${CURRENT_BRANCH}"

echo
echo "Done."
