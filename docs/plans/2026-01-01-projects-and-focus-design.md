# Projects and Focus-Based Work Selection

> **For Claude:** This is a design document for discussion. Implementation will follow after review.

## Overview

This design replaces the auto-generated goals approach in PR #3 with a more flexible system:

- **Projects** are persistent workspaces with notes, goals, and context (stored as files)
- **Focus** is a small set of active projects (max ~3) that Bud autonomously works on
- **Work selection** is skill-based and context-dependent, not hardcoded

## Core Concepts

### Projects

A project is a directory containing notes, goals, and context files:

```
~/.bud/projects/
  browserid-ng/
    notes.md          # Freeform notes, thoughts, context
    goals.md          # Current high-level goals for this project
    log.md            # Work log, decisions made, progress
    links.md          # Pointers to repos, beads DBs, docs, etc.

  research-hierarchical-memory/
    notes.md
    goals.md
    sources.md        # Papers, articles, references
    findings.md       # Synthesized insights

  learn-rust/
    notes.md
    goals.md
    exercises.md
```

Projects can have any structure - the only convention is that `notes.md` and `goals.md` exist.

### Focus (Memory Block)

The `focus` memory block contains pointers to currently active projects:

```json
{
  "projects": [
    {
      "name": "browserid-ng",
      "path": "~/.bud/projects/browserid-ng",
      "priority": 1,
      "notes": "Primary focus - shipping MVP"
    },
    {
      "name": "research-hierarchical-memory",
      "path": "~/.bud/projects/research-hierarchical-memory",
      "priority": 2,
      "notes": "Background research when blocked on primary"
    }
  ],
  "updated_at": "2026-01-01T10:00:00Z"
}
```

**Constraints:**
- Max ~3 projects in focus at once
- Projects not in focus can be worked on interactively, but Bud won't autonomously select them
- Future: scheduled tasks could override this (e.g., "check on project X every Monday")

### Goals

Goals live in each project's `goals.md` file, not in a central memory block:

```markdown
# Goals for browserid-ng

## Active

### Ship primary IdP support
- Priority: 1
- Deadline: 2026-01-15
- Links: [beads:BID-4], [beads:BID-5]
- Notes: Core feature needed for dogfooding

### Improve test coverage
- Priority: 2
- Links: [beads:BID-12]

## Completed

### Fix audience mismatch bug
- Completed: 2025-12-30
- Links: [beads:BID-3]
```

Goals are **synthesized collaboratively** (via project-review skill) or **asynchronously** (Bud synthesizes, shares via Discord for feedback).

---

## Scheduler Behavior

### Wake Cycle

Every 2 hours, the scheduler:

1. Checks budget availability
2. Invokes the `select-work` skill
3. Executes selected work until: done, unproductive, or budget depleted
4. Yields and logs results

### Select-Work Skill

The `select-work` skill is the entry point for work selection:

```
┌─────────────────────────────────────────────────────────┐
│                    select-work skill                     │
│                                                          │
│  1. Read focus memory block                              │
│  2. For each focused project (by priority):              │
│     a. Read project's notes.md and goals.md              │
│     b. Identify what kind of work is needed              │
│     c. Delegate to appropriate selection skill           │
│  3. Return selected work item with context               │
└─────────────────────────────────────────────────────────┘
         │
         │ delegates to
         ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ select-     │  │ select-     │  │ select-     │
│ coding-work │  │ research    │  │ writing     │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Key principle:** Selection skills are **not tied to project types**. A coding project might invoke `select-research` if the notes say "need to research X before implementing Y".

### Selection Skills

#### `select-coding-work`
- Query beads for ready tasks
- Consider blocked tasks and what would unblock them
- Return highest priority actionable task

#### `select-research`
- Look at research goals/questions in notes
- Check what sources have been reviewed
- Decide: gather more sources, synthesize existing, or write up findings

#### `select-writing`
- Look at writing goals
- Check current draft state
- Decide: outline, draft, revise, or publish

---

## Key Workflows

### 1. Interactive Project Work

User and Bud discuss a project. Bud takes notes:

```
User: "Let's work on browserid-ng. I want to focus on primary IdP support."

Bud: [Updates notes.md with context from conversation]
     [Creates/updates goals.md with discussed goals]
     [Logs conversation summary to log.md]
```

### 2. Project Review (Interactive or Autonomous)

User invokes `project-review` skill (works on any project, not just focused ones):

```
User: "/project-review browserid-ng"

Bud: [Reads all project files]
     [Synthesizes current state and recent progress]
     "Based on our notes and recent work:

      **Progress since last review:**
      - Completed BID-4 (primary IdP cert storage)
      - Started BID-5, ~60% done

      **Current goals:**
      1. Ship primary IdP support (blocking dogfooding)
      2. Improve test coverage (tech debt)

      **Suggested updates:**
      - BID-5 is close, bump to priority 1?
      - Add 'document deployment' as new goal?

      Does this capture it? Anything to add or reprioritize?"

User: "Yes, and add deployment docs as priority 3"

Bud: [Updates goals.md]
     [Updates log.md with review summary]
```

The `project-review` skill combines progress synthesis with goal review - no need for separate `synthesize-progress` skill.

### 3. Async Review (via Discord)

Bud autonomously reviews project and shares via Discord:

```
[Bud, in Discord]
"I reviewed the browserid-ng project notes. Based on recent work:
- Primary IdP support is ~80% done (BID-4 closed, BID-5 in progress)
- Test coverage improved but still gaps in error handling
- No deployment docs yet

Suggested goal updates:
1. Complete BID-5 (primary IdP email selection)
2. Add error handling tests
3. Start deployment docs

React 👍 to confirm or reply with changes."
```

### 4. Autonomous Work Cycle

```
[Scheduler wakes Bud]

Bud: [Invokes select-work skill]
     [Reads focus: browserid-ng (priority 1)]
     [Reads browserid-ng/goals.md: "Ship primary IdP support"]
     [Reads browserid-ng/links.md: beads DB at /path/to/browserid-ng]
     [Queries beads for ready tasks]
     [Finds BID-5: "Email selection should use stored primary IdP certs"]

     "Selected: BID-5 - implementing email selection fix"
     "Estimated cost: $0.50"

     [Works on BID-5]
     [Completes or yields when budget depleted]
     [Updates project log.md with progress]
```

### 5. Conversation Synthesis

After a conversation, user invokes synthesis (Bud figures out scope from context):

```
User: "/synthesize-to-project browserid-ng"

Bud: [Looks back at recent conversation]
     [Identifies relevant discussion - automatically determines how far back]
     [Extracts key insights:]
     - "Decided to use popup for IdP auth instead of redirect"
     - "Discussed resilience to buggy IdPs"
     - "New requirement: 2 minute timeout for auth popup"

     [Appends to browserid-ng/notes.md]
     [If new goals identified, suggests updates to goals.md]

     "Synthesized conversation to browserid-ng/notes.md:
      - Design decision: popup-based auth
      - New requirement: timeout handling
      - Added note about IdP resilience

      Want me to update goals.md too?"
```

**Context detection:** The skill looks backward through the conversation to find the natural boundary - typically a topic shift, a "/project" command, or start of session. No explicit begin/end signals needed.

---

## Skills Needed

### Core Skills

| Skill | Purpose |
|-------|---------|
| `select-work` | Entry point for autonomous work selection |
| `project-review` | Review any project: synthesize progress + update goals |
| `project-status` | Quick summary of a project's current state |

### Selection Skills (delegated from select-work)

| Skill | Purpose |
|-------|---------|
| `select-coding-work` | Query beads, pick ready task |
| `select-research` | Evaluate research progress, pick next step |
| `select-writing` | Evaluate writing progress, pick next step |

### Synthesis Skills

| Skill | Purpose |
|-------|---------|
| `synthesize-to-project` | Extract insights from conversation to project files (auto-detects scope) |

### Project Management Skills

| Skill | Purpose |
|-------|---------|
| `create-project` | Set up new project directory structure |
| `archive-project` | Move completed project out of active set |
| `update-focus` | Change which projects are in focus |

---

## The Note-Taking Challenge

You identified this as the potential achilles heel. Quality of autonomous work depends on quality of:

1. **Note capture** during conversations
2. **Goal synthesis** from notes
3. **Context retrieval** when selecting work

### Mitigations

1. **Interactive checkpoints**: Bud summarizes understanding, user confirms
2. **Structured templates**: Goals have consistent format (priority, deadline, links)
3. **Explicit links**: Goals link to beads issues, making them actionable
4. **Async review loop**: Discord sharing catches misunderstandings
5. **Conversation logging**: Full conversation summaries preserved for re-synthesis
6. **Context-aware synthesis**: `synthesize-to-project` auto-detects conversation boundaries

### Open Questions

- How much structure vs freeform in notes?
- Should Bud proactively ask clarifying questions during note-taking?
- How to handle conflicting information in notes?
- When should Bud escalate uncertainty vs make a judgment call?

---

## Changes to PR #3

### Keep
- Goal data structure concepts (priority, deadline, status, links)
- Work scheduler wake cycle
- Test infrastructure

### Remove
- Auto-goal generation (`analyzeFocusArea`)
- Proposal system (high/low confidence)
- `isRepoRelatedGoal` keyword matching
- Goals as central memory block
- `beads-helper.ts` (stub that does nothing)

### Change
- Focus memory block: text → structured JSON with project pointers
- Work selection: hardcoded priority → skill-based
- Goals storage: memory block → per-project files

### Add
- Project directory structure and conventions
- `select-work` skill (entry point)
- `select-coding-work` skill (real beads integration)
- `project-review` skill (interactive review + progress synthesis)
- `synthesize-to-project` skill (conversation → project notes)
- Discord integration for async review (future)

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Project directory structure
- [ ] Focus memory block format
- [ ] Basic `select-work` skill
- [ ] `select-coding-work` with real beads integration

### Phase 2: Project Management
- [ ] `project-review` skill
- [ ] `project-status` skill
- [ ] `create-project` skill
- [ ] `update-focus` skill

### Phase 3: Synthesis
- [ ] `synthesize-to-project` skill (with auto-scope detection)

### Phase 4: Async Loop
- [ ] Discord integration
- [ ] Async review workflow
- [ ] Reaction-based approval flow

---

## Example: Full Cycle

```
Day 1, 10:00 - Interactive session
═══════════════════════════════════
User: "Let's set up browserid-ng as a project"
Bud: [Creates ~/.bud/projects/browserid-ng/]
     [Discusses goals, writes notes.md and goals.md]
     [Links to beads DB]
User: "Add this to my focus"
Bud: [Updates focus memory block]

Day 1, 12:00 - Autonomous wake
═══════════════════════════════════
Scheduler: [Wakes Bud]
Bud: [select-work] → browserid-ng is priority 1
     [Reads goals: "Ship primary IdP support"]
     [select-coding-work] → queries beads
     [Finds BID-5, works on it]
     [Completes, updates log.md]
     [Yields]

Day 1, 14:00 - Autonomous wake
═══════════════════════════════════
Scheduler: [Wakes Bud]
Bud: [select-work] → browserid-ng
     [Reads goals, notes mention "research DNSSEC validation"]
     [select-research] → this is a research sub-task
     [Does research, updates notes.md with findings]
     [Yields]

Day 1, 16:00 - Interactive session
═══════════════════════════════════
User: [Discusses popup auth design with Bud]
User: "/synthesize-to-project browserid-ng"
Bud: [Auto-detects conversation scope]
     [Extracts design decisions to notes.md]

Day 1, 18:00 - Async review (Discord)
═══════════════════════════════════
Bud: [In Discord]
     "Progress update on browserid-ng:
      - Completed BID-5 (email selection)
      - Researched DNSSEC - findings in notes
      - Added popup auth design notes
      - Next: implement DNSSEC validation

      Goals still accurate? 👍 to confirm"

User: [Reacts 👍]

Day 2, 10:00 - Autonomous wake
═══════════════════════════════════
Scheduler: [Wakes Bud]
Bud: [Continues with DNSSEC implementation...]
```

---

## Appendix: Skill Interaction Diagram

```
                    ┌─────────────────┐
                    │   Scheduler     │
                    │  (every 2h)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  select-work    │
                    │     skill       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │  select-   │ │  select-   │ │  select-   │
       │coding-work │ │ research   │ │  writing   │
       └─────┬──────┘ └────────────┘ └────────────┘
             │
             ▼
       ┌────────────┐
       │   Beads    │
       │    MCP     │
       └────────────┘


User-invoked:

  /project-review <name>  ──→  project-review skill
  /synthesize-to-project  ──→  synthesize-to-project skill
  /update-focus           ──→  update-focus skill
```
