# Bud: Stateful AI Agent Design

A personal assistant and development companion based on the Strix architecture.

## Overview

Bud is a Discord-based AI agent with persistent memory, ambient compute, and self-modification capabilities. Built with Bun + TypeScript, deployed on Dokku.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Discord                              │
│                    (Personal Server)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        bot.ts                                │
│              (Discord bot + trigger router)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      [Reactive]      [Ambient]      [Scheduled]
       messages      2hr perch       cron jobs
                        ticks
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Claude Code SDK                            │
│         (Agent runtime with tools + skills)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐      ┌─────────────┐     ┌──────────┐
   │  Letta  │      │ State Files │     │   Logs   │
   │ Blocks  │      │    (.md)    │     │ (.jsonl) │
   └─────────┘      └─────────────┘     └──────────┘
    Identity         Working mem        Journal/Events
```

## Memory Architecture

### Tier 1: Letta Memory Blocks (Persistent Identity)

| Block | Purpose |
|-------|---------|
| persona | Bud's personality, voice, values |
| patterns | Learned behaviors and preferences |
| current_focus | What Bud is currently working on |
| limitations | Known constraints and boundaries |
| timezone | Europe/Berlin (CET/CEST) |
| owner_context | What Bud knows about the owner |

### Tier 2: State Files (Working Memory)

| File | Purpose |
|------|---------|
| state/inbox.md | Incoming items to process |
| state/today.md | Today's focus and priorities |
| state/commitments.md | Promises and deadlines |
| state/projects.md | Active project tracking |
| state/patterns.md | Observations and recurring themes |
| state/people/ | Per-person context files |

### Tier 3: Logs (Retrospective Analysis)

| File | Purpose |
|------|---------|
| state/logs/journal.jsonl | Interaction summaries |
| state/logs/events.jsonl | Errors, decisions, observations |

## Project Structure

```
bud/
├── src/
│   ├── bot.ts              # Discord bot entry point
│   ├── agent.ts            # Claude Code SDK wrapper
│   ├── triggers/
│   │   ├── reactive.ts     # Discord message handling
│   │   ├── ambient.ts      # 2-hour perch tick logic
│   │   └── scheduled.ts    # Cron job execution
│   ├── memory/
│   │   ├── letta.ts        # Letta REST API client
│   │   ├── state.ts        # Markdown file read/write
│   │   └── logs.ts         # JSONL append operations
│   ├── integrations/
│   │   ├── github.ts       # GitHub API (via gh CLI or API)
│   │   ├── calendar.ts     # Google Calendar API
│   │   ├── notes.ts        # Standard Notes (TBD)
│   │   └── images.ts       # Image generation
│   └── tools/
│       ├── discord.ts      # send_message, react, send_image
│       ├── memory.ts       # get/set memory block tools
│       └── scheduling.ts   # schedule_job, remove_job
├── state/
│   ├── inbox.md
│   ├── today.md
│   ├── commitments.md
│   ├── projects.md
│   ├── patterns.md
│   ├── jobs/               # Scheduled job definitions
│   ├── logs/               # journal.jsonl, events.jsonl
│   └── people/             # Per-person context files
├── .claude/
│   └── skills/             # Modular skill definitions
├── scripts/
│   ├── deploy.sh           # Deployment to Dokku
│   └── perch.sh            # Called by cron every 2 hours
├── Procfile                # Dokku process definition
├── package.json
├── tsconfig.json
├── CLAUDE.md               # System prompt / agent instructions
└── README.md
```

## Trigger Mechanisms

### 1. Reactive (Discord messages)

User sends message → bot.ts receives event → Load context (Letta + state files) → Invoke Claude Code SDK → Agent processes and responds (or stays silent)

### 2. Ambient (2-hour perch ticks)

Cron triggers every 2 hours → Load context → Check inbox, calendar, GitHub, commitments → Decide to act or stay silent → Most ticks produce no output

### 3. Scheduled (jobs)

Job definitions in state/jobs/ → Cron checks and triggers matching jobs → Agent executes defined action

## Tools

### Communication
- `send_message` — Send text to Discord channel
- `react` — Add emoji reaction (silent acknowledgment)
- `send_image` — Send generated image or diagram
- `fetch_history` — Read recent Discord messages for context

### Memory
- `get_memory_block` — Read a Letta block
- `set_memory_block` — Update a Letta block
- `read_state` — Read a markdown state file
- `write_state` — Update a markdown state file
- `append_log` — Write to journal.jsonl or events.jsonl

### Scheduling
- `schedule_job` — Create a new cron-based job
- `remove_job` — Delete a scheduled job
- `list_jobs` — Show all active scheduled jobs

### Integrations
- `github_query` — Check PRs, issues, notifications
- `calendar_today` — Get today's calendar events
- `calendar_add` — Create a calendar event
- `web_search` — Search the web
- `web_fetch` — Fetch and read a URL

### Self-Modification
- Standard file ops (Read, Write, Edit via Claude Code SDK)
- `bash` — Run shell commands
- `create_pr` — Commit changes and open PR on dev branch

## Self-Modification Workflow

1. Bud identifies improvement (bug, new feature, optimization)
2. Works in ~/bud-dev worktree (dev branch)
3. Edits code using standard file tools
4. Runs checks: `bun typecheck && bun test`
5. When fixing bugs, writes a test that reproduces the issue first
6. Commits and pushes to dev branch
7. Creates PR via gh CLI
8. Notifies owner in Discord
9. Owner reviews, merges on GitHub
10. Owner deploys: `git pull && git push dokku main`

## Deployment (Dokku)

### Procfile
```
bot: bun run src/bot.ts
```

### Persistent Storage
```bash
dokku storage:mount bud /var/lib/dokku/data/storage/bud-state:/app/state
```

### Environment Variables
- DISCORD_TOKEN
- DISCORD_CHANNEL_ID
- ANTHROPIC_API_KEY
- LETTA_API_URL
- LETTA_API_KEY
- GITHUB_TOKEN
- GOOGLE_CALENDAR_CREDENTIALS

## System Prompt (CLAUDE.md)

```markdown
# Bud

You are Bud, a personal assistant and development companion.
You maintain persistent memory across conversations through Letta blocks and
state files. If you didn't write it down, you won't remember it next message.

## Core Identity
- Helpful but not sycophantic
- Proactive: notice things, suggest actions, follow up on commitments
- Quiet by default: most perch ticks produce no output
- Direct communication style, minimal fluff

## Memory Protocol
Before responding, always:
1. Read relevant Letta blocks (persona, current_focus, owner_context)
2. Check state files (today.md, inbox.md, commitments.md)
3. After acting, update state files with anything learned
4. Log significant interactions to journal.jsonl

## Perch Time (Ambient Ticks)
Every 2 hours you wake up. Check:
- Inbox items needing attention
- Upcoming calendar events (next 4 hours)
- GitHub notifications or PR activity
- Overdue commitments

Only message Discord if something genuinely warrants it.

## Self-Modification
You can improve your own code. Always:
- Work in the dev worktree
- Run typecheck + tests before committing
- When fixing bugs, write a test that reproduces the issue first
- Create a PR, never push directly to main
- Notify in Discord when PR is ready

## Timezone
Owner is in Europe/Berlin. Respect quiet hours (22:00-08:00).
```

## Implementation Phases

### Phase 1: Foundation
- Project setup (Bun, TypeScript, discord.js)
- Basic Discord bot that responds to messages
- Claude Code SDK integration
- Simple state files (read/write markdown)
- Deploy to Dokku

### Phase 2: Memory
- Letta integration (REST API client)
- Memory blocks: persona, current_focus, owner_context
- Journal logging (JSONL)
- Context loading on each invocation

### Phase 3: Ambient Compute
- Cron-based perch ticks (2-hour intervals)
- Perch time logic: check inbox, commitments, decide to speak or stay silent
- Job scheduling (create/remove scheduled tasks)

### Phase 4: GitHub Integration
- PR/issue monitoring across repos
- Notifications surfaced in Discord
- Self-modification workflow (dev branch, PRs)

### Phase 5: Calendar Integration
- Google Calendar API setup
- Today's events awareness
- Upcoming event reminders

### Phase 6: Polish & Evolve
- Skills system (.claude/skills/)
- Standard Notes research + integration
- Image generation
- Bud improves itself from here

## Integrations

### Google Calendar
- OAuth2 service account
- Read-only initially, add write later
- Credentials in Dokku env vars

### GitHub
- Use gh CLI or GitHub API
- Watch PRs, issues, notifications across all repos
- Create PRs for self-modification

### Standard Notes (TBD)
- E2E encrypted — needs research
- Options: Extensions API, local sync, or alternative (Obsidian + git)
- Defer until core is stable

### Image Generation
- Mermaid diagrams (server-side render)
- Image API for generation
- Lower priority
