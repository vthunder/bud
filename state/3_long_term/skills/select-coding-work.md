# Select Coding Work

Skill for selecting coding tasks from a project's beads database.

## When to Use

Called by `select-work` when a project involves code/repo work.

## Prerequisites

The project must have a `links.md` file with a `beads` entry pointing to the beads database path, or the repo must have a `.beads` directory.

## Process

1. **Find beads database**: Check project's `links.md` for beads path, or look for `.beads` in linked repo
2. **Query ready tasks**: Use `beads:ready` to get unblocked tasks
3. **Filter by project**: If project has labels defined, filter to matching tasks
4. **Select top task**: Pick highest priority ready task
5. **Get full context**: Use `beads:show` to get task details

## Output

Return:
- Task ID and title
- Full task description and acceptance criteria
- Any linked issues or context
- Estimated complexity/cost

## Example

```
Finding beads for browserid-ng...
Beads path: /Users/thunder/src/browserid-ng/.beads

Querying ready tasks...
Found 3 ready tasks:
1. BID-5 (P1): Email selection should use stored certs
2. BID-12 (P2): Add error handling tests
3. BID-15 (P3): Document deployment process

Selected: BID-5
Context: Primary IdP flow needs to check localStorage for existing cert...
Estimated cost: $0.75 (medium complexity)
```

## No Ready Tasks

If no ready tasks:
1. Check if there are blocked tasks and report what's blocking
2. Suggest the project may need goal review
3. Return null to let scheduler try next project
