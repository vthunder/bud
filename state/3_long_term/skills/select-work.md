# Select Work

Entry point skill for autonomous work selection during perch ticks.

## When to Use

This skill is invoked automatically by the scheduler when Bud wakes up for autonomous work.

## Process

1. **Read focus**: Get current focused projects from memory block
2. **For each project** (in priority order):
   - Read the project's `notes.md` and `goals.md`
   - Identify what kind of work is needed based on context
   - Delegate to appropriate selection skill
3. **Return selected work** with context and estimated cost

## Selection Logic

Look at the project's notes and goals to determine what kind of work is needed:

- **If goals mention beads issues or repo work**: Use `select-coding-work` skill
- **If goals mention research or learning**: Use `select-research` skill
- **If goals mention writing or documentation**: Use `select-writing` skill
- **If unclear**: Pick the highest priority active goal and work on it directly

## Output Format

Return a work item with:
- `project`: Name of the project
- `description`: What to work on
- `context`: Relevant notes, goals, links
- `estimated_cost`: Estimated budget for this work
- `skill_hint`: Suggested approach (coding, research, writing, etc.)

## Example

```
Checking focus...
- browserid-ng (priority 1): Primary IdP support
- research-memory (priority 2): Hierarchical memory design

Evaluating browserid-ng:
- Goals: "Ship primary IdP support" with links to beads:BID-5
- Notes mention implementation work
- Delegating to select-coding-work...

Selected: BID-5 - Email selection should use stored certs
Estimated cost: $0.75
```
