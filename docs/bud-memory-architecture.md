# Bud Memory Architecture

> Nothing is deleted, but accessibility fades naturally.

## Storage Overview

```
/app/state/                   # Bud's state directory
├── memory.db                 # SQLite: blocks with version history (layers 1-3)
├── journal.jsonl             # Append-only event log (layer 3)
├── scheduled_tasks.json      # Task scheduling (layer 4)
├── owner.md                  # Full owner details (layer 4)
├── projects/                 # Project-specific memory (layer 4)
│   └── <project-name>/
│       ├── notes.md          # Required: freeform context, links
│       └── log.jsonl         # Required: append-only activity log
├── insights/                 # Dated insight extractions (layer 4)
│   └── 2026-01-02.md
└── .git/                     # Version history
```

## Memory Layers

### Layer 1: Identity

**What**: persona, values
**Where**: SQLite `memory_blocks` table (layer=1)
**In prompt**: Always
**Updates**: Owner-controlled, Bud cannot modify

Core identity that defines who Bud is. The code defines structure (prompt template, tools), memory defines content (persona, values).

### Layer 2: Semantic

**What**: owner_context, patterns, system_guide
**Where**: SQLite `memory_blocks` table (layer=2)
**In prompt**: Always
**Updates**: Bud updates patterns as operations evolve

Operational knowledge and architectural self-reference.

Key blocks:
- `owner_context` - Brief owner info (full details in /app/state/owner.md)
- `patterns` - **Operational manual**: wake-up behavior, how to use focus/goals/budget/tasks
- `system_guide` - Memory architecture reference (this document in block form)

### Layer 3: Working

**What**: focus, goals, budget status + journal
**Where**: SQLite `memory_blocks` table (layer=3) + journal.jsonl
**In prompt**: Always (blocks + last 40 journal entries)
**Updates**: Frequent, as context changes

Current operational state and recent activity. This layer includes both:
- **Memory blocks**: focus, goals, budget tracking
- **Journal**: Last 40 entries providing continuity across invocations

Key blocks:
- `focus` - Current project focus (max 3 projects)
- `goals` - Active goals with deadlines
- `budget_daily_cap`, `budget_daily_spent` - Managed by infrastructure, exposed for awareness

Journal entry types:
- `trigger` - What initiated an invocation (discord message, schedule, etc.)
- `response` - Bud's response to user
- `tool_use` - Tool invocations with input summaries
- `decision` - Decisions made with reasoning
- `work_completed` - Autonomous work sessions
- `error` - Errors encountered

### Layer 4: Long-term

**What**: Projects, insights, scheduled tasks, owner details, and other persistent files
**Where**: `/app/state/projects/`, `/app/state/insights/`, `/app/state/scheduled_tasks.json`, etc.
**In prompt**: On-demand via tools
**Updates**: As needed during work
**Capacity**: Unbounded (not limited by token context window)

Long-term storage for content that doesn't fit in the prompt. Loaded as needed using file tools. Can grow without limit since only relevant portions are loaded.

#### Scheduled Tasks

File: `/app/state/scheduled_tasks.json`

```json
[
  {
    "id": "unique-id",
    "description": "What to do",
    "timing": "daily",
    "requiresWakeup": false,
    "lastRun": "2026-01-02T10:00:00Z"
  }
]
```

- **timing**: `"daily"`, `"weekly"`, `"hourly"`, or exact ISO timestamp
- **requiresWakeup**: If true, scheduler wakes Bud when due; if false, processed when already awake
- **lastRun**: Updated after each execution (for recurring tasks)

One-off tasks (exact timestamp) removed after completion. Recurring tasks have lastRun updated.

#### Projects

```
/app/state/projects/<project-name>/
├── notes.md          # Required: context, links, anything relevant
└── log.jsonl         # Required: append-only activity log
```

**notes.md** - Freeform markdown containing:
- What this project is about
- Current status and context
- Links to relevant resources (repos, docs, beads)
- References to any additional project files

**log.jsonl** - Append-only activity log:
```jsonl
{"ts":"2026-01-02T10:00:00Z","type":"created","note":"Initial project setup"}
{"ts":"2026-01-02T14:00:00Z","type":"work","note":"Completed research phase","outcome":"Chose approach A"}
```

Log entry types: `created`, `update`, `work`, `milestone`, `decision`, `blocked`, `completed`

Additional files are optional and should be discoverable from notes.md.

#### Insights (Future)

Dated insight files extracted from journal and other sources:

```
/app/state/insights/
├── 2026-01-02.md     # Insights extracted on this date
└── 2026-01-03.md
```

Automated extraction crawls journal periodically to identify and preserve:
- Patterns learned
- Decisions made with reasoning
- Significant events
- Owner preferences discovered

*Not yet implemented - requires scheduled insight extraction.*

## History (Meta Layer)

All memory is version controlled and retrievable with effort:

- **SQLite history**: `get_block_history(name)` returns all versions of any block
- **Git history**: All files tracked in git with full commit history
- **Journal search**: `searchJournal()` searches entire log, not just recent entries

Nothing is truly deleted. Old information requires explicit query to access, but remains available.

## Storage Implementation

### memory.db

SQLite database backing layers 1-3 with append-only semantics:
- `set_block(name, value)` always INSERTs a new row
- `get_block(name)` returns latest version (highest id)
- `get_block_history(name)` returns all versions
- No UPDATE or DELETE operations

```sql
CREATE TABLE memory_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    value TEXT,
    layer INTEGER NOT NULL DEFAULT 2,  -- 1=identity, 2=semantic, 3=working
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### journal.jsonl

Append-only event log backing layer 3. The "train of thought" providing continuity across invocations.

## Decay & Accessibility

| Memory Type | Immediate Access | Fades After | Deep Access |
|-------------|------------------|-------------|-------------|
| Identity (L1) | Always in prompt | Never | N/A |
| Semantic (L2) | Always in prompt | Never | Block history |
| Working (L3) | Always in prompt | Overwritten | Block history |
| Journal (L3) | Last 40 entries | Entry 41+ | searchJournal() |
| Long-term (L4) | Never automatic | Always | Read file |
| Block history | Never automatic | Always | get_block_history() |
| Git history | Never automatic | Always | Git commands |

## Prompt Assembly

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (from code)                                   │
├─────────────────────────────────────────────────────────────┤
│ IDENTITY BLOCKS - layer 1                                   │
│ persona, values                                             │
├─────────────────────────────────────────────────────────────┤
│ SEMANTIC BLOCKS - layer 2                                   │
│ owner_context, patterns, system_guide                       │
├─────────────────────────────────────────────────────────────┤
│ WORKING STATE - layer 3                                     │
│ focus, goals, budget status                                 │
├─────────────────────────────────────────────────────────────┤
│ RECENT JOURNAL - layer 3 (last 40 entries)                  │
├─────────────────────────────────────────────────────────────┤
│ AVAILABLE TOOLS & SKILLS                                    │
├─────────────────────────────────────────────────────────────┤
│ CURRENT TRIGGER                                             │
└─────────────────────────────────────────────────────────────┘
```

**On-demand loading** (layer 4 and history):
- Scheduled tasks (on wake-up, per patterns)
- Project notes (when working on project)
- Insight files (when reviewing past learnings)
- Skill content (when skill invoked)
- Block history (when explicitly queried)
- Older journal entries (via search)

## Memory Tools

Bud has these tools for memory operations:

- `get_block(name)` - Read current value of a block
- `set_block(name, value, layer)` - Create new version of a block
- `list_blocks()` - List all block names
- `block_history(name)` - View all versions of a block
- `appendLog(file, entry)` - Append to journal or project log
- `searchJournal(query)` - Search full journal history
- `readFile(path)` - Read any file from layer 4

## Key Principles

1. **Append-only**: Blocks and journal only grow, history preserved
2. **Layered loading**: L1-L3 always loaded, L4 on-demand
3. **Natural decay**: Recent items accessible, old items require explicit query
4. **Unbounded long-term**: Layer 4 can grow without limit
5. **Self-documenting**: system_guide block explains architecture to Bud
6. **Projects as contexts**: Each project has isolated notes and activity log
7. **History everywhere**: Version control on blocks (SQLite) and files (git)
