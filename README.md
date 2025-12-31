# Bud

A personal AI agent that works autonomously toward your goals.

Bud is a "second brain" - an extension of your cognition that maintains persistent memory, learns your patterns, and proactively works on tasks. Unlike a chatbot that waits for prompts, Bud has goals and works toward them independently.

## Quick Start

```bash
bun install
bun run start          # Start Discord bot
bun run perch          # Run autonomous tick
bun run typecheck      # Type check
bun test               # Run tests
```

**Requirements:** Bun, Discord bot token, Anthropic API key

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Discord Bot   │────▶│     Agent       │────▶│  Claude SDK     │
│   (bot.ts)      │     │   (agent.ts)    │     │  + MCP Tools    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Memory       │     │    State        │     │    Budget       │
│   (SQLite)      │     │   (working/     │     │   ($5/day cap)  │
│                 │     │    idle)        │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

The bot responds to Discord messages. The perch runs on a schedule to do autonomous work. Both use the same agent and memory.

## Core Concepts

### Autonomous Operation

Bud doesn't just respond - it works independently:

- **Perch ticks** run periodically to check "Do I have work to do?"
- **Work selection** prioritizes: scheduled tasks → active goals → maintenance
- **Budget awareness** ensures daily spending stays within limits ($5/day default)
- **Preemption** allows user messages to interrupt autonomous work gracefully

When you message Bud while it's working, it says "One moment..." and wraps up before responding.

### Layered Memory

Memory is organized in layers with natural decay:

| Layer | What | Decay |
|-------|------|-------|
| Identity | persona, values, style | Owner-controlled only |
| Semantic | owner context, patterns | Updated when Bud learns |
| Working | focus, goals, schedule | Changes frequently |
| Journal | event log (last 40 in prompt) | Older entries require query |

Everything is append-only. Nothing is deleted, but accessibility fades naturally.

→ See [Memory Architecture](docs/bud-memory-architecture.md) for details

### Skills

Skills are markdown files that teach Bud how to do things:

```
state/.claude/skills/
├── sync-state.md      # How to backup state to git
├── self-improve.md    # How to improve own code
└── ...
```

Bud can invoke skills when needed and follow their instructions.

## Design Principles

1. **Useful** - Serves its owner specifically, not generically helpful
2. **Autonomous** - Goal-directed, proactive, but bounded by budget and ethics
3. **Stateful** - Persistent memory across conversations
4. **Coherent** - Stable identity that doesn't drift
5. **Observable** - Journal captures all decisions and actions
6. **Cost-aware** - Tracks and budgets API spending

→ See [Design Principles](docs/bud-design-principles.md) for the full philosophy

## Project Structure

```
src/
├── bot.ts           # Discord bot with preemption handling
├── agent.ts         # Main agent invocation
├── perch.ts         # Autonomous work scheduler
├── execution.ts     # Yield-aware execution wrapper
├── state.ts         # Working/idle state machine
├── budget.ts        # Daily cost tracking
├── prompt.ts        # Prompt assembly
├── memory/          # SQLite blocks, journal
├── tools/           # MCP tool servers
├── perch/           # Work selection, context gathering
└── integrations/    # GitHub, Calendar, etc.

docs/
├── bud-design-principles.md
├── bud-memory-architecture.md
└── plans/           # Implementation plans

state/               # Runtime state (separate repo)
├── memory.db        # SQLite memory blocks
├── journal.jsonl    # Append-only event log
└── .claude/skills/  # Skill definitions
```

## Interesting Design Choices

**Yield-based preemption** - The agent checks `shouldYield()` before each tool call. If a user message arrived or budget is exhausted, it wraps up gracefully instead of being killed mid-task.

**Berlin timezone budget reset** - Daily budget resets at midnight Berlin time (owner's timezone), not UTC.

**Append-only everything** - Memory blocks and journal are insert-only. "Latest version wins" for display, but all history is preserved and recoverable.

**State stored as JSON in SQLite** - The `bud_state` block holds a JSON object with status, current task, budget tracking, and preemption flags. Simple and inspectable.

**Separate state repo** - Personal data lives in a private `bud-state` repo, not in the public code repo.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **LLM:** Claude via [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **Interface:** Discord.js
- **Database:** SQLite (bun:sqlite)
- **Integrations:** GitHub API, Google Calendar

## License

MIT
