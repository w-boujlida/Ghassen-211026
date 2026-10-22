#!/bin/bash
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin
export TZ=Africa/Tunis

trap 'printf "[%s] ERROR: local commit failed (line %s)\n" "$(date --iso-8601=seconds)" "$LINENO" >&2' ERR

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
git rev-parse --show-toplevel >/dev/null

exec 9>"$(git rev-parse --git-path daily-local-commit.lock)"
if ! flock -n 9; then
    printf '[%s] Another daily commit is already running.\n' "$(date --iso-8601=seconds)"
    exit 0
fi

git symbolic-ref --quiet HEAD >/dev/null
for operation in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply BISECT_LOG; do
    if test -e "$(git rev-parse --git-path "$operation")"; then
        printf '[%s] ERROR: Git operation in progress: %s\n' "$(date --iso-8601=seconds)" "$operation" >&2
        exit 1
    fi
done

git var GIT_AUTHOR_IDENT >/dev/null
git var GIT_COMMITTER_IDENT >/dev/null
git add --all -- .
if git diff --cached --quiet; then
    printf '[%s] No changes to save.\n' "$(date --iso-8601=seconds)"
    exit 0
fi

git commit -m "Sauvegarde locale quotidienne $(date '+%Y-%m-%d %H:%M %Z')" \
    -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
printf '[%s] Local commit saved: %s\n' "$(date --iso-8601=seconds)" "$(git rev-parse --short HEAD)"
