# Projects and Focus

Bud uses a project-based system for organizing work.

## Concepts

### Projects

A project is a directory with two required files:

```
/app/state/projects/
  my-project/
    notes.md     # Required: freeform context, status, links
    log.jsonl    # Required: append-only activity log
```

**notes.md** contains everything relevant to the project:
- What the project is about
- Current status and context
- Links to repos, docs, beads
- References to any additional files in the project

**log.jsonl** is an append-only activity log in JSONL format:
```jsonl
{"ts":"2026-01-02T10:00:00Z","type":"created","note":"Initial project setup"}
{"ts":"2026-01-02T14:00:00Z","type":"work","note":"Completed research phase","outcome":"Chose approach A"}
{"ts":"2026-01-03T09:00:00Z","type":"milestone","note":"MVP complete"}
```

Log entry types:
- `created` - Project created
- `update` - Notes or context updated
- `work` - Work session completed
- `milestone` - Significant achievement
- `decision` - Decision made with reasoning
- `blocked` - Work blocked, with reason
- `completed` - Project finished

Additional files (research.md, goals.md, etc.) are optional and should be discoverable from notes.md.

### Focus

Focus is which projects Bud works on autonomously. Maximum 3 projects.

View focus: Ask Bud "what am I focused on?"
Add to focus: "Focus on [project]"
Remove: "Remove [project] from focus"

### Goals

Goals can be tracked in notes.md or a separate goals.md (referenced from notes.md):

```markdown
## Goals

### Active
- Ship feature X (deadline: 2026-01-15, beads: BUD-5)
- Fix performance issues

### Completed
- Fix bug Y (2026-01-01)
```

## Skills

- `select-work` - Autonomous work selection
- `select-coding-work` - Select from beads tasks
- `select-research` - Select research work
- `project-review` - Review and update goals
- `project-status` - Quick status summary
- `create-project` - Create new project
- `update-focus` - Manage focus
- `synthesize-to-project` - Save conversation insights
- `async-review` - Discord progress updates

## Workflow

1. Create project: `/create-project my-project`
2. Add to focus: "Focus on my-project"
3. Discuss goals with Bud
4. Bud works autonomously during perch ticks
5. Review progress: `/project-review my-project`
6. Save insights: `/synthesize-to-project my-project`
