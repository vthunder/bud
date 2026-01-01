# Project Review

Interactive skill for reviewing a project's state and updating goals.

## When to Use

- User invokes `/project-review <project-name>`
- Or autonomously during async review cycles

## Process

1. **Load project files**: Read notes.md, goals.md, log.md from project directory
2. **Synthesize progress**: Identify what's been accomplished since last review
3. **Present current state**:
   - Summary of notes
   - Active goals with status
   - Recent log entries
4. **Propose updates**:
   - Goals that appear complete
   - New goals implied by notes
   - Priority adjustments
5. **Get confirmation**: If interactive, ask user to confirm changes
6. **Update files**: Write changes to goals.md, append to log.md

## Output Format

```
## Project Review: [project-name]

### Progress Since Last Review
- [What's been accomplished]
- [Changes in status]

### Current Goals
1. [Goal 1] - Priority X - [Status]
2. [Goal 2] - Priority Y - [Status]

### Suggested Updates
- [ ] Mark "[goal]" as completed
- [ ] Add new goal: "[description]"
- [ ] Reprioritize "[goal]" from X to Y

Confirm these updates? (or suggest changes)
```

## Async Mode

When running autonomously (not interactive):
1. Make high-confidence updates automatically
2. Queue low-confidence changes for Discord notification
3. Log all changes to project's log.md
