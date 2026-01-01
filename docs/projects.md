# Projects and Focus

Bud uses a project-based system for organizing work.

## Concepts

### Projects

A project is a directory containing notes, goals, and context:

```
~/.bud/projects/
  my-project/
    notes.md     # Freeform notes and context
    goals.md     # Structured goals
    links.md     # Links to repos, resources
    log.md       # Activity log
```

### Focus

Focus is which projects Bud works on autonomously. Maximum 3 projects.

View focus: Ask Bud "what am I focused on?"
Add to focus: "Focus on [project]"
Remove: "Remove [project] from focus"

### Goals

Goals live in each project's `goals.md`:

```markdown
## Active

### Ship feature X
- Priority: 1
- Deadline: 2026-01-15
- Links: beads:BID-5

## Completed

### Fix bug Y
- Completed: 2026-01-01
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
