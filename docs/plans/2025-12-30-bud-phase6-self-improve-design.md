# Bud Phase 6: Self-Improvement Design

## Overview

Enable Bud to improve its own code through a skill-based workflow, with all changes going through PR review.

## Key Design Decisions

- **Git clone on server** - Bud works in `/app/state/bud-dev/` (persistent storage)
- **Triggered by** - Both explicit requests and observation-based (proactive)
- **Guardrails** - Can only modify `src/` and `tests/`, blocked paths need explicit approval
- **Communication** - Discord notification when PR is ready
- **Git workflow** - Single `dev` branch, one PR at a time
- **Skills-based** - Implemented as a skill in `/app/state/.claude/skills/`

## Architecture

```
Bud notices issue or receives request
        ↓
Invokes self-improve skill
        ↓
Clones/updates repo in /app/state/bud-dev/
        ↓
Creates fix on dev branch
        ↓
Runs typecheck + tests
        ↓
Commits, pushes, creates PR via gh CLI
        ↓
Notifies owner in Discord with PR link
```

## Skills Infrastructure

**Location:** `/app/state/.claude/skills/` (persistent storage, survives deploys)

**Format:** Markdown files that Bud reads and follows. Each skill has:
- Description of when to use it
- Step-by-step workflow
- Guardrails and constraints

**How Bud uses skills:**
1. Skills are loaded into system prompt context
2. Bud recognizes when a skill applies
3. Follows the documented workflow

## The Self-Improve Skill

**File:** `/app/state/.claude/skills/self-improve.md`

**Workflow:**

```
1. SETUP
   - Ensure /app/state/bud-dev exists (clone if not)
   - cd into repo, git fetch, checkout dev, reset to origin/main
   - This gives a clean slate each time

2. INVESTIGATE
   - Understand the issue (read relevant code, logs, error messages)
   - Identify which files need changes
   - Verify files are in allowed paths (src/, tests/)

3. IMPLEMENT
   - Make changes using standard file tools
   - Write test first if fixing a bug
   - Keep changes minimal and focused

4. VERIFY
   - Run: bun run typecheck
   - Run: bun test
   - If either fails, fix and retry (max 3 attempts)
   - If still failing, abort and report issue

5. SUBMIT
   - git add -A
   - git commit with descriptive message
   - git push origin dev
   - gh pr create (or update existing)

6. NOTIFY
   - Post in Discord: "Created PR: [title] - [link]"
   - Brief description of what was fixed/added
```

## Guardrails & Safety

**Allowed paths:**
- `src/**` - All source code
- `tests/**` - All test files

**Blocked paths (require explicit approval):**
- `Dockerfile`, `Procfile`, `docker-compose.yml` - Deployment config
- `package.json`, `tsconfig.json` - Project config
- `.env*`, `*.pem`, `*.key` - Secrets
- `.claude/skills/self-improve.md` - Can't modify its own safety rules
- `scripts/` - Deployment scripts

**Permission flow for blocked paths:**
1. Bud detects change needs a blocked path
2. Bud asks in Discord: "This fix requires modifying `package.json` to add X. Reply 'approved' to proceed."
3. Bud waits for reply (24h timeout)
4. If approved, proceeds; if denied/timeout, aborts

**Verification before PR:**
- Typecheck must pass
- Tests must pass
- Changes must be in allowed paths (or approved)
- Commit must have descriptive message

**Abort conditions:**
- Typecheck/tests fail after 3 fix attempts
- Trying to modify blocked paths without approval
- Git conflicts on dev branch
- PR already open (must wait for merge or close)

## Server Setup

**Already available:**
- Storage mounted at `/app/state/`
- `gh` CLI installed
- `git` installed

**Created on first use by Bud:**
- `/app/state/bud-dev/` - Git workspace
- `/app/state/.claude/skills/` - Skills directory

**Bud's container paths:**
- `/app/state/bud-dev/` - Git workspace
- `/app/state/.claude/skills/` - Skills directory

## Implementation Tasks

1. Create skills loading infrastructure in agent
2. Create `self-improve.md` skill file
3. Add code editing tools (bash, file ops) if not already available
4. Add self-improve capability to system prompt
5. Create setup script to initialize directories and skill file
6. Test the workflow end-to-end
