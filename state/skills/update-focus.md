# Update Focus

Skill for managing which projects are in focus.

## When to Use

- User says "focus on X" or "add X to focus"
- User says "remove X from focus" or "stop focusing on X"
- User asks "what am I focused on?"

## Commands

### Show Focus
"What am I focused on?" / "Show focus"

```
Current Focus (2/3 slots):
1. browserid-ng (P1) - Primary IdP support
2. bud-scheduler (P2) - Scheduler redesign

Available slot for 1 more project.
```

### Add to Focus
"Focus on [project]" / "Add [project] to focus"

- Check project exists
- Check slots available (max 3)
- Add with specified or default priority
- Confirm change

### Remove from Focus
"Remove [project] from focus" / "Unfocus [project]"

- Remove from focus list
- Project files remain unchanged
- Confirm change

### Reprioritize
"Make [project] priority 1" / "Reprioritize [project]"

- Update priority in focus config
- Re-sort list
- Confirm change

## Constraints

- Maximum 3 projects in focus
- Projects not in focus can still be worked on interactively
- Focus determines what Bud works on autonomously
