# Bud Memory Architecture

> Nothing is deleted, but accessibility fades naturally.

This document describes Bud's memory system - how state is stored, loaded, and decays over time.

## Design Goals

From [Bud Design Principles](./bud-design-principles.md):

- **Stateful**: Layered memory with automatic decay
- **Observable**: All events logged, state inspectable
- **Resilient**: Can recover from any past state
- **Cost-aware**: Efficient context usage

## Storage Overview

```
bud-state/                    # Separate private repo (not in bud/)
├── memory.db                 # SQLite: blocks with version history
├── journal.jsonl             # Append-only event log
├── files/                    # Git-tracked content
│   ├── insights/             # Dated learning files
│   │   └── 2025-12-31.md
│   ├── research/             # Project research
│   └── drafts/               # Work in progress
└── .git/                     # Local version history
```

**Why separate repo?** Keeps personal data out of public bud code repo. Can be backed up privately.

## Memory Layers

### Layer 1: Code (Foundational)

**What**: bot.ts, agent.ts, system prompt template, tools
**Where**: bud repo (public)
**Loading**: Defines structure, always present
**Decay**: Changes via PRs only

The most stable layer. Defines how everything else works.

### Layer 2: Identity Blocks (Surface)

**What**: persona, values, communication_style
**Where**: SQLite `memory_blocks` table
**Loading**: Always injected into prompt
**Decay**: Manual editing only

Core identity that doesn't change automatically. Owner must explicitly modify.

### Layer 3: Semantic Blocks (Context)

**What**: owner_context, patterns, limitations
**Where**: SQLite `memory_blocks` table
**Loading**: Always injected into prompt
**Decay**: Infrequent updates by Bud

Facts and learned patterns. Updated when Bud learns something significant.

### Layer 4: Working Blocks (State)

**What**: current_focus, goals, schedule, recent_insights (index)
**Where**: SQLite `memory_blocks` table
**Loading**: Always injected into prompt
**Decay**: Frequent updates, old values versioned

Current operational state. Changes often. Index blocks point to files.

### Layer 5: Journal (Temporal/Episodic)

**What**: All events, actions, decisions, errors
**Where**: journal.jsonl (append-only)
**Loading**: Last 40 entries injected into prompt
**Decay**: Recency - older entries require explicit query

The "train of thought" - provides continuity across invocations.

### Layer 6: Files (Long-term)

**What**: insights, research, drafts, project notes
**Where**: Git-tracked markdown files
**Loading**: On-demand (when referenced or needed)
**Decay**: Old files drop from index blocks

Larger content that doesn't fit in blocks. Accessed via index pointers.

### Layer 7: History (Deep)

**What**: All previous block versions, all git commits, full journal
**Where**: SQLite history + Git history
**Loading**: Explicit query only
**Decay**: Volume makes old content hard to find

Everything is preserved. Retrievable with effort.

## SQLite Schema

```sql
CREATE TABLE memory_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    value TEXT,
    layer INTEGER NOT NULL DEFAULT 3,  -- 2=identity, 3=semantic, 4=working
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_blocks_name ON memory_blocks(name);
CREATE INDEX idx_blocks_layer ON memory_blocks(layer);
```

**Append-only semantics:**
- `set_block(name, value)` always INSERTs a new row
- `get_block(name)` returns latest version (highest id)
- `get_block_history(name)` returns all versions
- No UPDATE or DELETE operations

**Layer field:**
- 2 = Identity (persona, values, style)
- 3 = Semantic (owner_context, patterns)
- 4 = Working (focus, goals, schedule, indices)

## Journal Format

Append-only JSONL. Every significant event logged.

```jsonl
{"ts":"2025-12-31T10:00:00Z","type":"trigger","source":"perch","context":"2hr tick"}
{"ts":"2025-12-31T10:00:01Z","type":"read","target":"goals","summary":"3 active goals"}
{"ts":"2025-12-31T10:00:02Z","type":"decision","action":"check_calendar","reason":"goal: stay on schedule"}
{"ts":"2025-12-31T10:00:03Z","type":"tool_use","tool":"calendar_events","result":"2 events today"}
{"ts":"2025-12-31T10:00:04Z","type":"decision","action":"stay_silent","reason":"nothing urgent"}
{"ts":"2025-12-31T10:05:00Z","type":"trigger","source":"message","from":"thunder","preview":"hey bud..."}
{"ts":"2025-12-31T10:05:01Z","type":"tool_use","tool":"set_block","block":"focus","value":"memory architecture"}
{"ts":"2025-12-31T10:05:02Z","type":"message_sent","channel":"discord","preview":"Sure, let's..."}
{"ts":"2025-12-31T10:05:03Z","type":"cost","tokens_in":1500,"tokens_out":800,"model":"opus"}
{"ts":"2025-12-31T10:10:00Z","type":"error","tool":"github_prs","error":"rate limited","recovery":"retry in 60s"}
{"ts":"2025-12-31T10:15:00Z","type":"insight","content":"owner prefers morning check-ins","file":"insights/2025-12-31.md"}
```

**Event types:**
| Type | Purpose |
|------|---------|
| `trigger` | What initiated this invocation (message, perch, cron) |
| `read` | File or block read for context |
| `decision` | Choice made, with reasoning |
| `tool_use` | Tool invoked, with result summary |
| `message_sent` | Output to Discord |
| `error` | Failures, unexpected behavior |
| `cost` | Resource usage |
| `insight` | Something learned |
| `focus_change` | Goal/focus shift |
| `block_update` | Memory block changed |

**Querying the journal:**
```bash
# Recent errors
jq 'select(.type=="error")' journal.jsonl | tail -10

# Decisions in last hour
jq 'select(.type=="decision" and .ts > "2025-12-31T09:00:00Z")' journal.jsonl

# Cost summary
jq 'select(.type=="cost") | .tokens_out' journal.jsonl | awk '{sum+=$1} END {print sum}'
```

## Prompt Assembly

On each invocation, the prompt is assembled from multiple sources:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SYSTEM PROMPT                                            │
│    Identity, guidelines, behavioral rules                   │
│    ← from code (bud repo)                                   │
├─────────────────────────────────────────────────────────────┤
│ 2. IDENTITY BLOCKS                                          │
│    persona, values, communication_style                     │
│    ← from SQLite layer 2                                    │
├─────────────────────────────────────────────────────────────┤
│ 3. SEMANTIC BLOCKS                                          │
│    owner_context, patterns, limitations                     │
│    ← from SQLite layer 3                                    │
├─────────────────────────────────────────────────────────────┤
│ 4. WORKING STATE                                            │
│    current_focus, goals, schedule, indices                  │
│    ← from SQLite layer 4                                    │
├─────────────────────────────────────────────────────────────┤
│ 5. AVAILABLE TOOLS                                          │
│    List of tools with brief descriptions                    │
│    ← from MCP server registrations                          │
├─────────────────────────────────────────────────────────────┤
│ 6. AVAILABLE SKILLS                                         │
│    List of skills (loaded on-demand when invoked)           │
│    ← from skills directory listing                          │
├─────────────────────────────────────────────────────────────┤
│ 7. RECENT JOURNAL (last 40 entries)                         │
│    Temporal context - "train of thought"                    │
│    ← from journal.jsonl tail                                │
├─────────────────────────────────────────────────────────────┤
│ 8. CURRENT TRIGGER                                          │
│    Message content, perch context, or cron job details      │
│    ← from invocation source                                 │
└─────────────────────────────────────────────────────────────┘
```

**On-demand loading** (not in initial prompt):
- Skill content (loaded when skill invoked)
- File content (loaded when file read)
- Block history (loaded when explicitly queried)

## Decay Mechanisms

| Layer | What Decays | How |
|-------|-------------|-----|
| Identity | Nothing automatic | Owner manually edits |
| Semantic | Outdated patterns | Bud updates when learning contradicts |
| Working | Old index entries | New entries push old ones out (e.g., keep last 30 insights) |
| Journal | Older entries | Only last 40 in prompt; older requires query |
| Files | Stale files | Drop from index after N days; file remains in git |
| History | Everything | Volume makes retrieval impractical without specific query |

**No garbage collection needed.** Access patterns create natural forgetting.

## File Organization

```
files/
├── insights/                 # Dated learning files
│   ├── 2025-12-29.md        # ← in recent_insights index
│   ├── 2025-12-30.md        # ← in recent_insights index
│   └── 2025-12-31.md        # ← in recent_insights index (most recent)
├── research/                 # Project-specific research
│   ├── memory-architecture/
│   └── vacation-planning/
├── drafts/                   # Work in progress
└── archive/                  # Explicitly archived (out of indices)
```

**Index block example** (`recent_insights`):
```json
["2025-12-31", "2025-12-30", "2025-12-29"]
```

When a new insight is added, oldest drops from index (but file remains).

## Recovery

Because everything is append-only and versioned:

**Block recovery:**
```sql
-- What was focus on Dec 25?
SELECT value FROM memory_blocks
WHERE name = 'current_focus'
AND created_at < '2025-12-26'
ORDER BY id DESC LIMIT 1;

-- Restore to that state
INSERT INTO memory_blocks (name, value, layer)
VALUES ('current_focus', <old_value>, 4);
```

**File recovery:**
```bash
# What was in insights on Dec 25?
git show HEAD~10:files/insights/2025-12-25.md

# Restore a deleted file
git checkout HEAD~10 -- files/insights/2025-12-25.md
```

**Journal analysis:**
```bash
# What happened on Dec 25?
jq 'select(.ts | startswith("2025-12-25"))' journal.jsonl

# Find when behavior drifted
jq 'select(.type=="focus_change")' journal.jsonl | tail -20
```

## Implementation Notes

### Block Operations

```typescript
// Get latest version of a block
async function getBlock(name: string): Promise<string | null> {
  const row = await db.get(
    "SELECT value FROM memory_blocks WHERE name = ? ORDER BY id DESC LIMIT 1",
    [name]
  );
  return row?.value ?? null;
}

// Set block (always inserts new version)
async function setBlock(name: string, value: string, layer: number = 4): Promise<void> {
  await db.run(
    "INSERT INTO memory_blocks (name, value, layer) VALUES (?, ?, ?)",
    [name, value, layer]
  );
  // Also log to journal
  await appendJournal({ type: "block_update", block: name, preview: value.slice(0, 100) });
}

// Get all blocks for prompt assembly
async function getAllCurrentBlocks(): Promise<Record<string, string>> {
  const rows = await db.all(`
    SELECT name, value FROM memory_blocks
    WHERE id IN (SELECT MAX(id) FROM memory_blocks GROUP BY name)
    ORDER BY layer, name
  `);
  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}
```

### Journal Operations

```typescript
// Append event to journal
async function appendJournal(event: JournalEvent): Promise<void> {
  const entry = JSON.stringify({ ts: new Date().toISOString(), ...event });
  await fs.appendFile(journalPath, entry + "\n");
}

// Get recent entries for prompt
async function getRecentJournal(count: number = 40): Promise<JournalEvent[]> {
  const content = await fs.readFile(journalPath, "utf-8");
  const lines = content.trim().split("\n");
  return lines.slice(-count).map(line => JSON.parse(line));
}
```

## Open Questions

### Goal Tracking

How should goals be represented?
- Explicit `goals` block with structured list?
- Emergent from focus + journal?
- Separate goals table in SQLite?

### Index Sizes

How many items before decay?
- `recent_insights`: 30 days? 30 items?
- `recent_research`: by project? by age?

### Journal Retention

Keep forever, or eventually archive?
- Full journal could grow large over months
- Could archive monthly: `journal-2025-12.jsonl`
- Or keep rolling window in main file

### Prompt Size Management

What if assembled prompt exceeds context?
- Truncate journal entries first?
- Summarize older entries?
- Adaptive loading based on task?
