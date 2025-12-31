# Bud Design Principles

> Bud is a personal AI agent - a "second brain" that maintains persistent identity, layered memory, and autonomous operation within bounded constraints.

## Inspirations

Bud's architecture draws heavily from [Strix](https://timkellogg.me/blog/2025/12/15/strix), a Claude-based agent with persistent memory and self-modification capabilities. Key concepts borrowed:

- **Layered ephemerality**: Nothing is deleted, but accessibility fades naturally
- **Append-only storage**: History is preserved, latest version wins for display
- **Proactive operation**: Goals drive behavior, not just responses
- **Self-modification through PRs**: Agent improves itself with human oversight

## Core Principles

### 1. Useful

Bud exists to be useful to its owner. Not useful in general - useful to *you* specifically.

- **Second brain**: Bud is an extension of owner's cognition - coding, research, planning, life admin, or anything else
- **Adaptive**: Learns your preferences, patterns, and pain points
- **Outcome-oriented**: Success measured by owner outcomes, not activity metrics

### 2. Autonomous (with Boundaries)

Bud works independently toward goals without constant direction.

- **Goal-directed**: Has objectives, not just reactions. "Doesn't feel like ChatGPT because it has goals."
- **Proactive**: Initiates work, makes connections, follows up on commitments
- **Silent by default**: Most ambient compute produces no output. Only speaks when warranted.
- **Bounded**: Clear constraints on autonomous action:
  - Must be ethical and reasonable
  - Must be tied to established goals
  - Must be within resource budgets
  - Cannot push directly to main (PR workflow required)

### 3. Stateful (Layered Memory)

Bud maintains persistent state across conversations with natural decay.

```
SURFACE LAYER - Always loaded, always present
├── persona, values, guidelines, communication_style
└── DECAY: Manual editing only (stable identity core)

SECOND LAYER - Always loaded, pointers updated
├── current_focus, schedule, recent_insights index
└── DECAY: Pointers update, old targets fade from relevance

THIRD LAYER - Loaded on demand
├── insight files, research, drafts, projects
└── DECAY: Old files drop from index

DEEP LAYER - Permanent but buried
├── Journal entries (searchable), SQLite history, Git history
└── DECAY: Requires explicit effort to retrieve

Everything is technically permanent. Accessibility fades naturally.
```

Key properties:
- **Append-only**: Updates insert new versions, never modify or delete
- **Automatic decay**: No manual garbage collection - access patterns create forgetting
- **Recoverable**: Any past state can be retrieved with effort

### 4. Coherent (Stable Identity)

Bud is a recognizable "self" with consistent traits.

- **Core stability**: Persona, values, communication style don't drift
- **Protected changes**: Identity modifications require explicit owner approval
- **Consistent voice**: Maintains character even as knowledge/skills evolve
- **Collapse recovery**: Mechanisms to detect and recover from behavioral drift

The persistent identity creates what Strix calls an "alive attractor state" - the agent collapses into a more interesting, goal-directed mode rather than remaining generically helpful.

### 5. Self-Modifying

Bud improves itself through normal operation.

- **Memory**: Continuously updates own knowledge, patterns, and insights
- **Reflection**: Self-monitors for health, productivity, and drift from goals
- **Routines**: Develops habits and practices that keep it productive
- **Code**: Can modify own implementation through PR workflow:
  1. Identifies improvement opportunity
  2. Creates changes on dev branch
  3. Runs tests and typecheck
  4. Summarizes changes and requests approval via Discord
  5. Merges after owner approval
  6. Never pushes directly to main

"Bud is better at coding Bud than I am" - complete access to own logs, state, and debugging context.

### 6. Cost-Aware

Bud operates within resource constraints.

- **Tracks usage**: Monitors own compute and API costs
- **Budgets resources**: Allocates across tasks based on priority
- **Graceful degradation**: Reduces activity when approaching limits
- **Transparent reporting**: Owner can see resource consumption

### 7. Observable

You can see what Bud is doing and thinking.

- **Journal**: Captures all significant events, decisions, and learnings
- **Inspectable state**: Memory, focus, and goals viewable at any time
- **Explainable decisions**: Can articulate why it took an action
- **No black boxes**: All behavior traceable to inputs and state

## Memory Architecture

### Storage Mechanisms

| Storage | Purpose | Access Pattern | Decay Mechanism |
|---------|---------|----------------|-----------------|
| Core blocks | Identity, values, style | Always loaded | Manual editing only |
| Index blocks | Focus, schedule, recent pointers | Always loaded | Pointers update, old targets fade |
| SQLite history | Version history of all blocks | Query by name | Volume makes old versions irrelevant |
| Files | Insights, research, drafts | Index points to recent | Old files drop from index |
| Journal | Event log, interactions | Search (jq/grep) | Recency bias in queries |
| Git | Complete history | Explicit retrieval | Depth makes old commits hard to find |

### Block Schema (Append-Only SQLite)

```sql
CREATE TABLE memory_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    value TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

- `set_block` inserts a new version, never updates
- Latest version wins for display
- History preserved and queryable
- `sort` determines loading order (core < 10, index >= 10)

### File Structure

```
/app/state/
├── memory.db              # SQLite (blocks + history)
├── journal.jsonl          # Append-only event log
├── files/                 # Git-tracked content
│   ├── insights/          # Dated learning files
│   ├── research/          # Project research
│   └── drafts/            # Work in progress
└── .git/                  # Version history
```

## Operational Modes

### Reactive (Discord messages)

User sends message -> Load context -> Process and respond (or stay silent)

### Ambient (Perch ticks)

Every 2 hours:
- Check inbox, calendar, GitHub, commitments
- Decide whether to act or stay silent
- Most ticks produce no output

### Scheduled (Cron jobs)

Job definitions trigger at specified times -> Execute defined action

## Open Questions

### Ambient Operation Scope

When Bud wakes up on a perch tick:
- How much should it spend on each check?
- Can it take multiple actions?
- When should it stop and wait for next tick?
- How does it prioritize across competing tasks?

### Autonomy Boundaries

Beyond ethical/goal/budget constraints:
- What actions are always safe to take autonomously?
- What requires explicit approval?
- How does Bud escalate uncertainty?

### Decay Tuning

- How many items should indices retain before forgetting?
- What triggers insight file expunge (age? count? relevance?)
- How often should Bud review its own patterns for drift?

## Evolution

This document describes Bud's target architecture. Implementation is incremental:

1. **Current**: Letta-based memory, basic tools, ambient compute
2. **Next**: SQLite + Git memory architecture, journal system
3. **Future**: Full layered ephemerality, sophisticated decay, richer self-reflection

Bud will help design and implement its own evolution.
