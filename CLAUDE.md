# Bud

A Discord-based personal assistant with persistent memory.

## Project Structure

```
src/
├── bot.ts          # Discord bot entry point
├── agent.ts        # Claude Code SDK wrapper
├── config.ts       # Environment configuration
└── memory/
    ├── state.ts    # Markdown state file operations
    └── logs.ts     # JSONL logging operations
state/
├── inbox.md        # Items to process
├── today.md        # Current focus
├── commitments.md  # Tracked promises
└── logs/           # JSONL log files
```

## Running Locally

```bash
# Install dependencies
bun install

# Copy env template and fill in values
cp .env.example .env

# Run in development mode (with hot reload)
bun run dev

# Run tests
bun test

# Type check
bun run typecheck
```

## Deployment

Deployed to Dokku. State files are persisted via storage mount.

```bash
# First time setup on Dokku server:
dokku apps:create bud
dokku storage:mount bud /var/lib/dokku/data/storage/bud-state:/app/state
dokku config:set bud DISCORD_TOKEN=xxx DISCORD_CHANNEL_ID=xxx ANTHROPIC_API_KEY=xxx

# Deploy:
git remote add dokku dokku@server:bud
git push dokku main
```

## Current Phase

Phase 1: Foundation
- [x] Discord bot responds to messages
- [x] Claude Code SDK integration
- [x] State file read/write
- [x] JSONL logging
- [ ] Production deployment

Next: Phase 2 (Memory - Letta integration)
