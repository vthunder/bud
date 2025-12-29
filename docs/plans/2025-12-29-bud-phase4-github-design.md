# Bud Phase 4: GitHub Integration Design

## Overview

Bud gains GitHub integration with two main capabilities:
1. **Monitoring** - Track PRs and issues across configured repos, surface updates in Discord
2. **Self-modification** - Work on its own code via feature branches and PRs

## Configuration

**Environment variables:**
- `GITHUB_TOKEN` - Personal Access Token for `gh` CLI authentication
- `GITHUB_REPOS` - Comma-separated list of repos to monitor (e.g., `vthunder/bud,avail-project/avail-core`)

**New files:**
- `src/integrations/github.ts` - GitHub API wrapper using `gh` CLI
- `src/integrations/github-state.ts` - State management for seen items
- `src/tools/github.ts` - MCP tools for agent to query GitHub
- `state/github-seen.json` - Tracks notified items to avoid duplicates

**Docker changes:**
- Install `gh` CLI in the container

## Authentication

Uses the `gh` CLI which respects the `GITHUB_TOKEN` environment variable. This avoids implementing OAuth flows and handles pagination, rate limiting, etc.

## Monitoring

### What Gets Tracked

**Pull Requests:**
- New PRs opened
- PRs where you're requested as reviewer
- New comments on PRs you authored or are involved in
- PR merged or closed

**Issues:**
- New issues assigned to you
- New comments on issues you're assigned to or authored
- Issues closed

### How It Works

1. During full perch ticks (every 2 hours), Bud runs `gh` commands to fetch recent activity
2. Compares against `state/github-seen.json` to find new items
3. Formats a summary and posts to Discord if there's anything new
4. Updates the seen-state file

### State File Structure

```json
{
  "lastCheck": "2025-12-29T16:00:00Z",
  "seen": {
    "vthunder/bud#pr-12": "2025-12-29T14:00:00Z",
    "vthunder/bud#issue-8": "2025-12-28T10:00:00Z"
  }
}
```

On each save, entries older than 7 days are pruned to keep the file bounded.

### Example Discord Message

```
GitHub updates:

vthunder/bud:
- PR #12 opened: "Add retry logic to Discord sender" by dependabot
- Issue #8: New comment from @collaborator

avail-project/core:
- PR #456: Review requested from you
```

## On-Demand Queries

MCP tools exposed to the agent:

| Tool | Description |
|------|-------------|
| `github_prs` | List open PRs (optionally filtered by repo, author, reviewer) |
| `github_issues` | List open issues (optionally filtered by repo, assignee) |
| `github_pr_details` | Get full details of a specific PR (diff stats, comments, status) |
| `github_notifications` | Check unread GitHub notifications |

These tools wrap `gh` CLI commands:
- `gh pr list --repo X --json number,title,author,state`
- `gh issue list --repo X --assignee @me --json number,title,state`
- `gh api notifications`

## Self-Modification Workflow

When Bud wants to improve its own code:

1. **Create feature branch** from main:
   ```bash
   cd ~/bud-dev && git checkout main && git pull
   git checkout -b fix/improve-error-handling
   ```

2. **Make changes** using standard file tools (Read, Edit, Write)

3. **Validate:**
   ```bash
   bun run typecheck && bun test
   ```

4. **Commit and push:**
   ```bash
   git add -A && git commit -m "fix: improve error handling"
   git push -u origin fix/improve-error-handling
   ```

5. **Create PR:**
   ```bash
   gh pr create --title "Fix: Improve error handling" --body "..."
   ```

6. **Notify in Discord:** "I've opened PR #15 to improve error handling. Ready for your review."

**Safeguards:**
- Never push directly to main
- Always run typecheck + tests before committing
- You review and merge all PRs manually

## Perch Integration

During full perch ticks (every 2 hours):

1. Load `state/github-seen.json`
2. For each repo in `GITHUB_REPOS`:
   - Fetch recent PRs: `gh pr list --repo X --json ...`
   - Fetch issues assigned to you: `gh issue list --repo X --assignee @me --json ...`
3. Compare against seen state, identify new items
4. If new items exist:
   - Include in perch decision context
   - If Bud decides to speak, format and include GitHub summary
5. Update seen state with new items, prune entries > 7 days
6. Save `state/github-seen.json`

Decision maker prompt receives GitHub context to decide whether to mention updates.

## Implementation Tasks

1. Install gh CLI in Docker
2. Create GitHub integration module (`src/integrations/github.ts`)
3. Create GitHub state management (`src/integrations/github-state.ts`)
4. Add GitHub MCP tools (`src/tools/github.ts`)
5. Integrate with perch (context + decision maker)
6. Add self-modification workflow support
7. Config and deploy
