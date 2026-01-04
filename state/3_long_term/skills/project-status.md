# Project Status

Quick status summary for a project.

## When to Use

- User asks "what's the status of [project]?"
- User invokes `/project-status <project-name>`
- Called by other skills needing project context

## Process

1. **Load project**: Read notes.md and goals.md
2. **Summarize**:
   - Active goals count and top priority
   - Recent activity (from log.md if exists)
   - Key notes/context
3. **Return concise summary**

## Output Format

```
**[project-name]** - [one-line description from notes]

Active Goals: X | Completed: Y | Blocked: Z

Top Priority: [goal title] (P1)
- [brief status/next step]

Last Activity: [date] - [what happened]
```

## Example

```
**browserid-ng** - BrowserID implementation for modern web

Active Goals: 2 | Completed: 5 | Blocked: 0

Top Priority: Ship primary IdP support (P1)
- BID-5 in progress, email selection fix

Last Activity: 2026-01-01 - Completed popup auth resilience
```
