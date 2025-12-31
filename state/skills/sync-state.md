# Sync State to GitHub

Commit and push local state changes to the private GitHub backup repo.

## When to Use

- Run approximately once per day
- After significant memory updates
- Before major changes or experiments

## How to Sync

Run these commands via Bash:

```bash
cd /app/state && \
git add -A && \
git diff --cached --quiet || \
(git commit -m "State backup $(date -Iseconds)" && \
git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/vthunder/bud-state.git && \
git push origin main)
```

This will:
1. Stage all changes
2. Check if there are any staged changes
3. If changes exist, commit with timestamp and push

## Notes

- The remote URL uses GITHUB_TOKEN for authentication
- Only commits if there are actual changes (avoids empty commits)
- State includes: memory.db, journal.jsonl, logs/, skills/
