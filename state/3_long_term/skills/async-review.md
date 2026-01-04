# Async Review

Skill for autonomous project review with Discord notification.

## When to Use

- Scheduled periodic review (e.g., daily)
- After completing significant work
- When progress warrants owner notification

## Process

1. **Select project**: Pick highest priority focused project
2. **Gather state**: Read notes, goals, recent log entries
3. **Synthesize progress**: What changed since last async review?
4. **Generate summary**: Concise Discord-friendly format
5. **Send notification**: Post to Discord
6. **Log review**: Record in project's log.md

## Discord Format

Keep under 2000 characters. Use markdown formatting.

```
**Project Update: [name]**

📊 **Progress**
- [What was accomplished]
- [Status changes]

🎯 **Current Goals**
1. [Top goal] - [status]
2. [Next goal] - [status]

💡 **Suggested Updates**
- [Any proposed changes]

React 👍 to confirm goals are accurate, or reply with changes.
```

## Reaction Handling

Future enhancement: Monitor for reactions and replies
- 👍 = Goals confirmed, continue
- 💬 Reply = Process feedback, update goals

## Frequency

- Don't send more than once per day per project
- Skip if no meaningful progress since last review
- Always send if goals were completed
