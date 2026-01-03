# Bud

A Discord-based personal assistant with persistent memory.

## Project Structure

```
src/
├── bot.ts           # Discord bot entry point
├── agent.ts         # Agent invocation and prompt building
├── execution.ts     # Claude Code CLI execution via tmux
├── claude-session.ts # Tmux session management for Claude Code
├── mcp-server.ts    # Standalone MCP server for tools
├── config.ts        # Environment configuration
├── prompt.ts        # System prompt construction
├── state.ts         # Agent state management
├── budget.ts        # Daily budget tracking
├── perch.ts         # Autonomous perch tick execution
└── memory/
    ├── blocks.ts    # SQLite memory block operations
    ├── journal.ts   # JSONL activity logging
    └── logs.ts      # General log file operations
state/
├── memory.db        # SQLite database for memory blocks
├── journal.jsonl    # Activity journal
└── skills/          # Skill markdown files
```

## Architecture

Bud uses local Claude Code CLI instances running in tmux sessions:

1. **Claude Session Manager** (`claude-session.ts`): Creates and manages tmux sessions for Claude Code instances
2. **MCP Server** (`mcp-server.ts`): Standalone MCP server providing memory, calendar, GitHub, and skill tools
3. **Execution** (`execution.ts`): Sends prompts to Claude via tmux and captures responses

Each request runs `claude --print --dangerously-skip-permissions` in a tmux window for visibility and debugging.

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

# Run the MCP server standalone (for testing)
bun run src/mcp-server.ts
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

## Tmux Sessions

When running, Bud creates a tmux session named `bud-claude` with windows for each request:
- Attach with: `tmux attach -t bud-claude`
- List windows: `tmux list-windows -t bud-claude`
- The session is automatically cleaned up on bot shutdown

## Current Phase

Phase 1: Foundation
- [x] Discord bot responds to messages
- [x] Claude Code CLI integration (via tmux)
- [x] State file read/write
- [x] JSONL logging
- [x] MCP server for tools
- [ ] Production deployment

Next: Phase 2 (Memory - Letta integration)
